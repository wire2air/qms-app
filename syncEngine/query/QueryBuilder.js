import { IndexedDB } from '../persistence/IndexedDB.js'
import ModelRegistry from '../core/ModelRegistry.js'
import { hydrate } from '../persistence/hydration.js'

/**
 * Chainable query builder for finding model instances.
 *
 * Index condition is set via the constructor; additional in-memory
 * filters are added with `.where(field, value | fn)`.
 *
 * @example
 * // Indexed lookup
 * const versions = await db.DocumentVersion.where('documentId', id).exec()
 *
 * // Indexed lookup + in-memory filter + sort + limit
 * const drafts = await db.DocumentVersion.where('documentId', id)
 *   .where('statusId', 'DRAFT')
 *   .orderBy('createdAt', 'desc')
 *   .limit(10)
 *   .exec()
 *
 * // Full scan with cursor (no index)
 * const all = await db.Document.where().exec()
 *
 * // Function predicate
 * const high = await db.Issue.where('status', 'open')
 *   .where('priority', v => v > 3)
 *   .first()
 *
 * // Compound index
 * const logs = await db.AuditLog.where('[entityType+entityId]', ['Document', id]).exec()
 *
 * // IN-style — match any of several values
 * const docs = await db.Document.where('statusId', ['DRAFT', 'APPROVED']).exec()
 */
export class QueryBuilder {
  #modelName
  #tableName = null

  #indexName = null
  #indexValue = null

  #conditions = []
  #sortBy = null
  #limit = null
  #offset = 0
  #paranoidField = null

  /**
   * @param {string} modelName — registered model class name
   * @param {string} [indexField] — IDB index to use for the initial lookup
   * @param {*} [indexValue] — value to match against the index
   * @param {boolean|string} [paranoid] — soft-delete field name, or `true` for 'deletedAt'
   */
  constructor(modelName, indexField, indexValue, paranoid) {
    this.#modelName = modelName

    if (indexField) {
      // Only pre-set the indexed path when the field is genuinely a
      // registered IDB index (customIndex). Otherwise fall back to an
      // in-memory filter — slower (cursor scan) but it returns rows
      // instead of throwing NotFoundError when the caller didn't know
      // the field wasn't an index.
      //
      // Compound indexes are passed as e.g. '[entityType+entityId]'; the
      // bracket prefix is the convention. We trust those directly because
      // there's no JS-side equivalent — if the model declared the
      // compound index, the IDB store has it.
      if (indexField.startsWith('[') || ModelRegistry.hasIndex(modelName, indexField)) {
        this.#indexName = indexField
        this.#indexValue = indexValue
      } else {
        this.#conditions.push([indexField, indexValue])
      }
    }

    if (paranoid) {
      this.#paranoidField = typeof paranoid === 'string' ? paranoid : 'deletedAt'
    }
  }

  /**
   * Resolve and cache the IndexedDB store name for this model.
   * @returns {string}
   */
  #getTableName() {
    if (this.#tableName === null) {
      this.#tableName = ModelRegistry.getTableName(this.#modelName)
    }
    return this.#tableName
  }

  /**
   * Add an in-memory filter condition.
   * @param {string} field — property name to match
   * @param {*|((value: *) => boolean)} value — exact value or predicate function
   * @returns {this}
   */
  where(field, value) {
    this.#conditions.push([field, value])
    return this
  }

  /**
   * Sort results by a field.
   * @param {string} field — property name to sort by
   * @param {'asc'|'desc'|((a: *, b: *) => number)} [direction='asc'] — direction or custom comparator
   * @returns {this}
   */
  orderBy(field, direction = 'asc') {
    this.#sortBy = [field, direction]
    return this
  }

  /** Alias for {@link orderBy}. */
  sortBy(field, direction = 'asc') {
    return this.orderBy(field, direction)
  }

  /**
   * Limit the number of returned results.
   * @param {number} n
   * @returns {this}
   */
  limit(n) {
    this.#limit = n
    return this
  }

  /**
   * Skip the first N matching results (applied after sort).
   * @param {number} n
   * @returns {this}
   */
  offset(n) {
    this.#offset = n
    return this
  }

  /**
   * Execute the query and return all matching hydrated model instances.
   * @returns {Promise<object[]>}
   */
  async exec() {
    let records = await this.#execute()

    if (this.#sortBy) {
      records = this.#applySort(records)
    }

    // offset + limit AFTER sort
    if (this.#offset > 0) {
      records = records.slice(this.#offset)
    }

    if (this.#limit !== null) {
      records = records.slice(0, this.#limit)
    }

    return this.#hydrateResults(records)
  }

  /**
   * Execute and return the first matching instance, or `null`.
   * @returns {Promise<object|null>}
   */
  async first() {
    const results = await this.limit(1).exec()
    return results[0] ?? null
  }

  /**
   * Execute and return the last matching instance (reverse-sorts by PK if no sort is set).
   * @returns {Promise<object|null>}
   */
  async last() {
    if (!this.#sortBy) {
      const schema = ModelRegistry.getSchema(this.#modelName)
      this.orderBy(schema.primaryKey, 'desc')
    }
    return this.first()
  }

  // ─────────────────────────────────────────────
  // Core execution (optimized)
  // ─────────────────────────────────────────────

  /**
   * Core fetch: picks the best index (or falls back to cursor scan),
   * retrieves raw records, and applies in-memory filters.
   * @returns {Promise<object[]>}
   */
  async #execute() {
    const table = this.#getTableName()

    // 1. Determine best index if not provided
    if (!this.#indexName) {
      const idx = this.#chooseBestIndex()
      if (idx) {
        this.#indexName = idx[0]
        this.#indexValue = idx[1]
      }
    }

    // 2. Indexed path (fast path)
    if (this.#indexName) {
      // if value is an array and index is not compound or
      // if value is a nested array and index is compound,
      // then treat as IN query and use multi-get
      const isArrayIN =
        (Array.isArray(this.#indexValue) && !this.#indexName.startsWith('[')) ||
        (Array.isArray(this.#indexValue?.[0]) && this.#indexName.startsWith('['))

      let records = isArrayIN
        ? await IndexedDB.getByIndexMulti(table, this.#indexName, this.#indexValue)
        : await IndexedDB.getByIndex(table, this.#indexName, this.#indexValue)

      return this.#applyPostFilters(records)
    }

    // 3. Cursor scan (NO getAll)
    return IndexedDB.scan(table, (record) => this.#matches(record), {
      limit: this.#sortBy ? null : this.#limit, // can't early limit if sorting later
      offset: this.#sortBy ? 0 : this.#offset,
    })
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  /**
   * Scan conditions for one that matches a known IDB index,
   * promoting it from in-memory filter to indexed lookup.
   * @returns {[string, *]|null} — `[field, value]` tuple or `null`
   */
  #chooseBestIndex() {
    for (const [field, value] of this.#conditions) {
      if (typeof value !== 'function' && ModelRegistry.hasIndex?.(this.#modelName, field)) {
        return [field, value]
      }
    }
    return null
  }

  /**
   * Test a single record against paranoid filter + all conditions.
   * Used as the predicate for cursor-based scans.
   * @param {object} record — raw IDB record
   * @returns {boolean}
   */
  #matches(record) {
    if (this.#paranoidField && record[this.#paranoidField] != null) {
      return false
    }

    for (const [field, test] of this.#conditions) {
      const value = record[field]

      if (typeof test === 'function') {
        if (!test(value)) return false
      } else if (Array.isArray(test)) {
        if (!test.includes(value)) return false
      } else {
        if (value !== test) return false
      }
    }

    return true
  }

  /**
   * Filter records returned from an indexed lookup through
   * paranoid check + all in-memory conditions.
   * @param {object[]} records
   * @returns {object[]}
   */
  #applyPostFilters(records) {
    let result = records

    if (this.#paranoidField) {
      result = result.filter((r) => r[this.#paranoidField] == null)
    }

    for (const [field, test] of this.#conditions) {
      result = result.filter((r) => {
        const value = r[field]
        if (typeof test === 'function') return test(value)
        if (Array.isArray(test)) return test.includes(value)
        return value === test
      })
    }

    return result
  }

  /**
   * Sort records in-memory by the configured field/direction.
   * Supports `'asc'`, `'desc'`, or a custom comparator function.
   * @param {object[]} records
   * @returns {object[]}
   */
  #applySort(records) {
    const [field, direction] = this.#sortBy

    if (typeof direction === 'function') {
      return [...records].sort((a, b) => direction(a[field], b[field]))
    }

    const dir = direction === 'desc' ? -1 : 1

    return [...records].sort((a, b) => {
      const va = a[field]
      const vb = b[field]

      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
      return 0
    })
  }

  /**
   * Convert raw IDB records into hydrated model instances.
   * @param {object[]} records
   * @returns {Promise<object[]>}
   */
  async #hydrateResults(records) {
    if (records.length === 0) return []

    const schema = ModelRegistry.getSchema(this.#modelName)
    const pk = schema.primaryKey

    return Promise.all(records.map((r) => hydrate(this.#modelName, r[pk], {}, r)))
  }
}
