import { LOAD_STRATEGY } from '../shared/constants.js'

/**
 * djb2 hash — fast, dependency-free, good enough for schema versioning.
 * @param {string} str
 * @returns {string} hex string
 */
function simpleHash(str) {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i)
    hash = hash >>> 0 // force unsigned 32-bit
  }
  return hash.toString(16)
}

/**
 * Central registry for all @ClientModel classes.
 *
 * modelLookup  — model name → constructor
 * schemas      — model name → { schemaHash, loadStrategy, properties, indexes }
 */
const ModelRegistry = {
  modelLookup: /** @type {Record<string, Function>} */ ({}),
  schemas:
    /** @type {Record<string, { schemaHash: string, loadStrategy: string, properties: Map, indexes: Array }>} */ ({}),

  /**
   * Called by @ClientModel once all property metadata has been collected.
   * @param {string} name
   * @param {Function} constructor
   * @param {Array<{ name: string, type: string, options: object }>} properties
   * @param {string} loadStrategy
   * @param {number} schemaVersion
   * @param {Array<{ type: string, field?: string, fields?: string[] }>} indexes
   */
  register(
    name,
    constructor,
    properties,
    loadStrategy = LOAD_STRATEGY.INSTANT,
    schemaVersion = 1,
    indexes = [],
    primaryKey = 'id',
    syncField = undefined,
    tableName,
  ) {
    const sortedNames = properties.map((p) => p.name).sort()
    const customIndexStr = indexes
      .map((idx) => (idx.type === 'single' ? idx.field : `[${idx.fields.join('+')}]`))
      .sort()
      .join(',')
    const hashSource = `${name}:v${schemaVersion}:${sortedNames.join(',')}:${customIndexStr}:pk=${primaryKey}`
    const schemaHash = simpleHash(hashSource)
    const propertiesMap = new Map(properties.map((p) => [p.name, p]))

    this.modelLookup[name] = constructor
    this.schemas[name] = {
      schemaHash,
      loadStrategy,
      properties: propertiesMap,
      indexes,
      primaryKey,
      syncField,
      tableName,
    }
  },

  getSchema(name) {
    return this.schemas[name] ?? null
  },

  getConstructor(name) {
    return this.modelLookup[name] ?? null
  },

  /**
   * Get the IndexedDB store name for a model.
   * Returns tableName if set, otherwise falls back to modelName.
   * @param {string} modelName
   * @returns {string}
   */
  getTableName(modelName) {
    const schema = this.schemas[modelName]
    return schema?.tableName ?? modelName
  },

  hasIndex(modelName, field) {
    const schema = this.schemas[modelName]
    if (!schema) return false
    // Only a genuine 'single' index is usable via IDBObjectStore#index(field) —
    // a compound index is created under its own joined name (e.g.
    // '[fromType+fromId]'), not under its first field's name, so
    // `store.index('fromType')` throws NotFoundError. Matching on a compound
    // index's first field here previously made QueryBuilder try exactly that
    // and crash (silently caught by useLiveQuery's try/catch), leaving any
    // `.where(<compoundFirstField>, value)` query stuck on its `initial`
    // value forever — e.g. RecordLink's customIndex declares only
    // `[fromType+fromId]`/`[toType+toId]` (no standalone 'fromType'/'toType'
    // index), so every `db.RecordLink.where('fromType', ...)` query (used by
    // both the Complaints and Quality Events "escalated" tracking) failed.
    return schema.indexes.some((idx) => idx.type === 'single' && idx.field === field)
  },
}

export default ModelRegistry
