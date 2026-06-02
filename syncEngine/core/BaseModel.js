import ModelRegistry from './ModelRegistry.js'
import { ObjectPool } from './ObjectPool.js'
import { hydrate } from '../persistence/hydration.js'
import { QueryBuilder } from '../query/QueryBuilder.js'
import { OPERATION, LOAD_STRATEGY } from '../shared/constants.js'
import { ModelValidator, ValidationError } from './ModelValidator.js'
import { MutationRunner } from '../network/MutationRunner.js'
import { MetaCache } from './MetaCache.js'
import { IndexedDB } from '../persistence/IndexedDB.js'
import { syncBus } from './syncBus.js'
import { DateTime } from 'luxon'

// Re-export for backwards compatibility
export { ValidationError }

/**
 * Base class for all @ClientModel classes.
 *
 * Provides:
 *   save() — validates the instance and delegates to BaseModel._saveStrategy
 *     (installed by SyncEngine). The strategy is responsible for deciding
 *     whether a network round trip is needed; for UPDATE it diffs the
 *     in-memory instance against the latest persisted IDB row and skips
 *     the request when there is no change.
 *
 *   delete() / hardDelete() / restore() — lifecycle helpers that set the
 *     instance's #action and call save().
 *
 *   create() — static helper that constructs a fresh instance, applies
 *     timestamp fields, and registers the instance in the ObjectPool.
 *
 *   findByPk() / where() — read helpers that hydrate model instances from
 *     IndexedDB.
 *
 *   reload() — re-reads this instance's fields from IDB.
 */
export class BaseModel {
  /**
   * Pluggable save strategy — set by SyncEngine.install() to wire persistence.
   * Must be installed before any model save() is called.
   * @type {((instance: BaseModel) => Promise<void>) | null}
   */
  static _saveStrategy = null

  /**
   * @type {boolean|string} paranoid delete mode — if true, delete() will set a "deletedAt" timestamp instead of removing the record.
   * If a string is provided, it will be used as the field name for the timestamp (e.g., "deletedAt").
   * The field must be decorated with @Property({ type: Date }) or @Property({ type: DateTime }).
   * Note: paranoid mode is opt-in and must be explicitly enabled by setting this static property in the model class.
   * Example:
   *   class User extends BaseModel {
   *     static paranoid = true // uses "deletedAt" by default
   *     // or
   *     static paranoid = "deletedAt" // specify custom field name
   *
   *     @Property({ type: Date }) deletedAt = null
   *     // ...
   *   }
   */
  static paranoid = false

  /**
   * Returns a "now" value appropriate for the given type constructor.
   * @param {Function} type — Number, String, Date, or DateTime
   * @returns {*}
   */
  static #nowForType(type) {
    if (type === Number) return Date.now()
    if (type === String) return new Date().toISOString()
    if (type === DateTime) return DateTime.now()
    return new Date()
  }

  /**
   * Set all @Property({ timestamp: true }) fields to their current-time value.
   * Called once during create().
   * @param {BaseModel} instance
   * @param {Object} schema
   */
  static #applyTimestamps(instance, schema) {
    if (!schema?.properties) return
    for (const [name, meta] of schema.properties) {
      if (meta.options?.timestamp) {
        instance[name] = BaseModel.#nowForType(meta.options.type)
      }
    }
  }

  #action = OPERATION.UPDATE

  /**
   * Cached schema for the model class. Looked up once per subclass on first
   * access — schemas are identical across all instances of a given model, so
   * the cache lives on the constructor instead of on each instance.
   *
   * `this` inside a static getter is the class being accessed; the assignment
   * creates an own property on that subclass, so Document, User, etc. each
   * get their own cache slot rather than sharing BaseModel's inherited one.
   */
  static get schema() {
    if (!Object.prototype.hasOwnProperty.call(this, '_cachedSchema')) {
      this._cachedSchema = ModelRegistry.getSchema(this.name)
    }
    return this._cachedSchema
  }

  /**
   * Create a new instance of this model class.
   * Sets action to 'create' so save() will queue a create operation.
   * @param {Record<string, unknown>} object — initial property values
   * @returns {InstanceType} — hydrated instance
   */
  static create(object) {
    const modelName = this.name
    const Ctor = ModelRegistry.getConstructor(modelName)
    if (!Ctor) throw new Error(`[BaseModel] Unknown model: ${modelName}`)

    const schema = this.schema
    const pk = schema.primaryKey

    // Create instance
    const instance = new Ctor()

    // Assign provided properties
    for (const [key, value] of Object.entries(object)) {
      if (value !== undefined) {
        instance[key] = value
      }
    }

    // Set timestamp fields to current time
    BaseModel.#applyTimestamps(instance, schema)

    // Mark as create action
    instance.#action = OPERATION.CREATE

    // Register in pool
    ObjectPool.register(modelName, instance[pk], instance)

    return instance
  }

  /**
   * Find a model instance by primary key.
   *
   * Lookup order:
   *   1. IndexedDB (via `hydrate`) — fast path for records the local store
   *      already has.
   *   2. If absent and the model is networked (not LOAD_STRATEGY.LOCAL): fetch
   *      from the server via GraphQL, persist to IDB, hydrate, and return.
   *      Emits a `syncBus` 'create' event so other live queries see the new
   *      record. Returns null if the server says the record does not exist.
   *
   * Paranoid filter is applied after the lookup completes so a soft-deleted
   * record fetched from the server is written to IDB but returned as null
   * unless `force: true` is passed.
   *
   * @param {*} id - The primary key value
   * @param {{ force?: boolean }} [options]
   * @returns {Promise<this|null>} The model instance or null if not found
   */
  static async findByPk(id, { force = false } = {}) {
    let instance = await hydrate(this.name, id)

    if (!instance) {
      const schema = this.schema
      if (schema && schema.loadStrategy !== LOAD_STRATEGY.LOCAL) {
        const meta = MetaCache.get(this.name)
        if (meta) {
          const record = await MutationRunner.fetchOne(meta, id)
          if (record) {
            const tableName = ModelRegistry.getTableName(this.name)
            await IndexedDB.put(tableName, record)
            instance = await hydrate(this.name, id, {}, record)
            syncBus.emit({
              modelName: this.name,
              modelId: id,
              action: 'create',
              type: 'sync',
            })
          }
        }
      }
    }

    if (!force && instance && this.paranoid) {
      const field = typeof this.paranoid === 'string' ? this.paranoid : 'deletedAt'
      if (instance[field] != null) return null
    }
    return instance
  }

  /**
   * Reload this instance's properties from IndexedDB.
   * Can be called externally to re-sync an in-memory instance from the IDB state.
   * @returns {Promise<void>}
   */
  async reload() {
    const modelName = this.constructor.name
    const pk = this.constructor.schema.primaryKey
    await hydrate(modelName, this[pk])
  }

  /**
   * Create a QueryBuilder for filtering instances.
   * @param {string} [indexField] — indexed field name (or compound bracket syntax)
   * @param {unknown} [indexValue] — value to look up via the index
   * @param {Object} [options] — additional options
   * @param {boolean} [options.force=false] — force query even if paranoid mode is enabled
   * @returns {QueryBuilder}
   */
  static where(indexField, indexValue, { force = false } = {}) {
    return new QueryBuilder(this.name, indexField, indexValue, force ? false : this.paranoid)
  }

  /**
   * Mark this instance for deletion.
   * Sets action to 'delete' so save() will queue a delete operation.
   * @returns {Promise<void>}
   */
  async delete() {
    const self = toRaw(this)

    const paranoid = this.constructor.paranoid
    if (paranoid) {
      const field = typeof paranoid === 'string' ? paranoid : 'deletedAt'
      const propMeta = this.constructor.schema?.properties?.get(field)
      const fieldType = propMeta?.options?.type

      if (fieldType === DateTime) {
        this[field] = DateTime.now()
      } else if (fieldType === Number) {
        this[field] = Date.now()
      } else {
        // Date or any other type — default to native Date
        this[field] = new Date()
      }
      self.#action = OPERATION.UPDATE
    } else {
      self.#action = OPERATION.DELETE
    }
    await self.save()
  }

  /**
   * Restore a soft-deleted instance by clearing the paranoid field.
   * @returns {Promise<void>}
   */
  async restore() {
    const field =
      typeof this.constructor.paranoid === 'string' ? this.constructor.paranoid : 'deletedAt'
    this[field] = null
    toRaw(this).#action = OPERATION.UPDATE
    await toRaw(this).save()
  }

  /**
   * Permanently delete this instance, bypassing paranoid soft-delete.
   * @returns {Promise<void>}
   */
  async hardDelete() {
    const self = toRaw(this)
    self.#action = OPERATION.DELETE
    await self.save()
  }

  /**
   * Get the current action for this instance.
   * @returns {string}
   */
  get action() {
    return toRaw(this).#action
  }

  /**
   * Validates properties and delegates to the installed save strategy.
   *
   * Whether the save fires a network request is decided by the save strategy,
   * not here — for UPDATE actions, `directSaveStrategy` reads the latest IDB
   * row, diffs against the in-memory instance, and skips the request entirely
   * if nothing changed. autoUpdate fields like `updatedAt` are filled in by
   * the server and written back via the mutation response.
   *
   * @returns {Promise<void>}
   */
  async save() {
    const self = toRaw(this)

    ModelValidator.validate(this, this.constructor.name)

    if (!BaseModel._saveStrategy) {
      throw new Error('[BaseModel] No _saveStrategy installed; call SyncEngine.install() first')
    }
    await BaseModel._saveStrategy(self)

    self.#action = OPERATION.UPDATE
  }
}
