// hydration.js
import { IndexedDB } from './IndexedDB.js'
import { ObjectPool } from '../core/ObjectPool.js'
import ModelRegistry from '../core/ModelRegistry.js'
import { defaultSerializers } from './defaultSerializers.js'
import { DateTime } from 'luxon'
import { beginHydration, endHydration, isEdited } from '../core/editTracker.js'

/**
 * Deep equality check for deserialized model values.
 *
 * Avoids triggering reactive setters when the hydrated value is structurally
 * identical to what the instance already holds. The IDB layer round-trips
 * arrays/objects through JSON.parse(JSON.stringify(...)), so freshly hydrated
 * values always have new references — a shallow check would always say
 * "different" and re-assign on every refresh, producing pointless setter
 * triggers and downstream watcher work.
 *
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
export function valuesEqual(a, b) {
  if (Object.is(a, b)) return true
  // Luxon DateTime — compare by millisecond value.
  if (a instanceof DateTime && b instanceof DateTime) {
    return a.isValid && b.isValid && a.toMillis() === b.toMillis()
  }
  // Native Date.
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime()
  }
  // Arrays — recursive element-wise compare so arrays of plain objects (e.g.
  // attachments lists) match after a JSON round-trip.
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!valuesEqual(a[i], b[i])) return false
    }
    return true
  }
  // Plain objects — recursive key-by-key compare. Class instances (DateTime,
  // Date, Map, Set) are handled by their dedicated branches above; if a value
  // reaches here it is treated as a plain object/POJO.
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false
    const ak = Object.keys(a)
    const bk = Object.keys(b)
    if (ak.length !== bk.length) return false
    for (const k of ak) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false
      if (!valuesEqual(a[k], b[k])) return false
    }
    return true
  }
  return false
}

/**
 * Deserialize a value from its stored (raw) form.
 * @param {*} value - raw value from IndexedDB
 * @param {{ type: Function, options: { serializer?: { fromStore: Function } } } | undefined} propertyMeta
 * @returns {*}
 */
export function deserializeValue(value, propertyMeta) {
  if (!propertyMeta) return value

  const { options = {} } = propertyMeta

  // 1. Property-level custom serializer
  if (options.serializer?.fromStore) {
    return options.serializer.fromStore(value)
  }

  // 2. Default serializers (Date, Map, Set)
  const typeName = options.type?.name
  if (typeName && defaultSerializers[typeName]?.fromStore) {
    return defaultSerializers[typeName].fromStore(value)
  }

  // 3. Fallback: return as-is
  return value
}

/**
 * Serialize a value for storage in IndexedDB.
 * @param {*} value - value from model instance
 * @param {{ type: Function, options: { serializer?: { toStore: Function } } } | undefined} propertyMeta
 * @returns {*}
 */
export function serializeValue(value, propertyMeta) {
  if (value === undefined || value === null) return value
  if (!propertyMeta) return value

  const { options = {} } = propertyMeta

  // 1. Property-level custom serializer
  if (options.serializer?.toStore) {
    return options.serializer.toStore(value)
  }

  // 2. Default serializers (Date, Map, Set, DateTime)
  const typeName = options.type?.name
  if (typeName && defaultSerializers[typeName]?.toStore) {
    return defaultSerializers[typeName].toStore(value)
  }

  // 3. Fallback: return as-is
  return value
}

/**
 * Hydrate a single model instance from IndexedDB.
 * @param {string} modelName
 * @param {*} id
 * @param {object} [overrides] - partial field values to apply after hydration
 * @param {object} [rawRecord] - pre-fetched raw record to skip IndexedDB read
 * @returns {Promise<InstanceType<typeof import('../core/BaseModel.js').BaseModel>|null>}
 */
export async function hydrate(modelName, id, overrides = {}, rawRecord = null) {
  const schema = ModelRegistry.getSchema(modelName)
  const pk = schema.primaryKey
  const tableName = ModelRegistry.getTableName(modelName)

  const raw = rawRecord ?? (await IndexedDB.get(tableName, id))
  if (!raw) return null

  const Ctor = ModelRegistry.getConstructor(modelName)
  if (!Ctor) return null

  // Use pk value from record (not the lookup key, which may differ)
  const pkValue = raw[pk]
  const existingInstance = ObjectPool.get(modelName, pkValue)

  // The whole apply section is synchronous, so the module-level hydration flag
  // can't interleave with user-land writes. Every assignment below is
  // engine-driven and must NOT register as a user edit in the editTracker.
  beginHydration()
  let instance
  try {
    instance = existingInstance ?? new Ctor()

    const propertyMetaMap = schema.properties

    // Server is authoritative — overwrite the local instance with the record
    // from IDB, EXCEPT fields carrying an unflushed local edit (editTracker):
    // clobbering those loses user input that hasn't reached the server yet
    // (the in-flight-save / debounced-autosave race — e.g. a workflow step's
    // type snapping back after a quick second change). Those fields keep the
    // local value; their own save flushes them and clears the edit mark.
    // Also skip fields whose deserialized value already equals the current
    // value, to avoid spurious reactive setter triggers.
    for (const [key, value] of Object.entries(raw)) {
      if (key in overrides) continue
      if (existingInstance && isEdited(instance, key)) continue
      const deserialized = deserializeValue(value, propertyMetaMap.get(key))
      if (!existingInstance || !valuesEqual(deserialized, instance[key])) {
        instance[key] = deserialized
      }
    }

    for (const [key, value] of Object.entries(overrides)) {
      instance[key] = value
    }
  } finally {
    endHydration()
  }

  ObjectPool.register(modelName, pkValue, instance)

  return instance
}

/**
 * Serialize a model instance and store it to IndexedDB.
 * Opposite of hydrate - converts model instance to storable values and persists.
 * @param {string} modelName
 * @param {object} instance - model instance
 * @returns {Promise<object>} - the deserialized object that was stored (for reference)
 */
export async function dehydrate(modelName, instance) {
  const schema = ModelRegistry.getSchema(modelName)
  if (!schema) throw new Error(`[dehydrate] Unknown model: ${modelName}`)

  const pk = schema.primaryKey
  const tableName = schema.tableName
  const result = { [pk]: instance[pk] }

  for (const [key, propMeta] of schema.properties) {
    const value = instance[key]
    result[key] = serializeValue(value, propMeta)
  }

  await IndexedDB.put(tableName, result)

  return result
}

/**
 * Serialize a model instance to a plain object WITHOUT writing to IndexedDB.
 * Used by MutationRunner to build GraphQL mutation variables before the API call.
 *
 * @param {string} modelName
 * @param {object} instance - model instance
 * @param {'create'|'update'|null} [op] - mutation kind; when set, fields whose
 *   `excludeFromGraphQL` includes this op are omitted from the result.
 * @returns {object} serialized record suitable for network/IDB use
 */
export function serializeModel(modelName, instance, op = null) {
  const schema = ModelRegistry.getSchema(modelName)
  if (!schema) throw new Error(`[serializeModel] Unknown model: ${modelName}`)

  const pk = schema.primaryKey
  const result = { [pk]: instance[pk] }

  for (const [key, propMeta] of schema.properties) {
    if (op && propMeta.options?.excludeFromGraphQL?.includes(op)) continue
    result[key] = serializeValue(instance[key], propMeta)
  }

  return result
}

/**
 * Build an UPDATE patch by diffing the in-memory instance against its last-
 * persisted IDB row. Returns an object containing only the properties whose
 * serialized values differ. Fields marked `excludeFromGraphQL: ['update']`
 * are always omitted.
 *
 * Called from directSaveStrategy at save time — replaces the previous eager
 * dirty-tracking system. The "previousRecord" should be the raw IDB row read
 * immediately before the mutation so the diff captures only changes the user
 * has made on top of the latest known server state (and ignores fields that
 * a concurrent socket push has already brought up to date).
 *
 * @param {string} modelName
 * @param {object} instance - in-memory model instance with current values
 * @param {object|null} previousRecord - last-known raw IDB row, or null for fresh creates
 * @returns {object} patch object suitable for the GraphQL update mutation's `patch` field
 */
export function computeUpdatePatch(modelName, instance, previousRecord) {
  const schema = ModelRegistry.getSchema(modelName)
  if (!schema) throw new Error(`[computeUpdatePatch] Unknown model: ${modelName}`)

  const patch = {}
  for (const [key, propMeta] of schema.properties) {
    if (propMeta.options?.excludeFromGraphQL?.includes('update')) continue
    const newValue = serializeValue(instance[key], propMeta)
    const prevValue = previousRecord?.[key]
    if (!valuesEqual(newValue, prevValue)) {
      patch[key] = newValue
    }
  }
  return patch
}

/**
 * Hydrate all instances of a model from IndexedDB.
 * @param {string} modelName
 * @returns {Promise<object[]>}
 */
export async function hydrateAll(modelName) {
  const schema = ModelRegistry.getSchema(modelName)
  const pk = schema.primaryKey
  const tableName = ModelRegistry.getTableName(modelName)
  const records = await IndexedDB.getAll(tableName)
  return Promise.all(records.map((r) => hydrate(modelName, r[pk], {}, r)))
}
