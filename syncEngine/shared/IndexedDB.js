// IndexedDB.js
import { TX_MODE } from './constants.js'

export class IndexedDB {
  /**
   * @type {IDBDatabase}
   */
  static #db = null

  /**
   * @type {string|null}
   */
  static #currentDbName = null

  /**
   * Initialize and open the IndexedDB database.
   * @param {string} dbName
   * @returns {Promise<IDBDatabase>}
   */
  static async init(dbName) {
    if (IndexedDB.#db && IndexedDB.#currentDbName !== dbName) {
      IndexedDB.#db.close()
      IndexedDB.#db = null
      IndexedDB.#currentDbName = null
    }

    if (IndexedDB.#db) return IndexedDB.#db
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1)
      console.log(`[IndexedDB] Opening database "${dbName}"`)

      // Settle-once guard so onblocked / timeout / late onerror after
      // settling can't double-resolve. Without this guard, a blocked
      // open silently hangs the App.vue boot path forever — user sees
      // the dark loading overlay and calls it a "black screen".
      let settled = false
      const settleResolve = (value) => {
        if (settled) return
        settled = true
        resolve(value)
      }
      const settleReject = (err) => {
        if (settled) return
        settled = true
        reject(err)
      }

      req.onerror = () => settleReject(req.error)
      req.onsuccess = () => {
        IndexedDB.#db = req.result
        IndexedDB.#currentDbName = dbName
        // versionchange fires when ANOTHER tab/connection tries to
        // upgrade/delete this same DB. Close our handle eagerly so the
        // other side isn't blocked by us — otherwise their open() hangs
        // and they see the black-screen-on-refresh symptom.
        IndexedDB.#db.onversionchange = () => {
          console.warn(`[IndexedDB] versionchange on "${dbName}" — closing connection`)
          IndexedDB.close()
        }
        settleResolve(IndexedDB.#db)
      }
      req.onupgradeneeded = (event) => {
        console.log(`[IndexedDB] Upgrading database to version ${event.newVersion}`)
        this.ensureSchema(event.target.result)
      }
      // onblocked: another live connection (same DB, lower version)
      // is preventing the upgrade. Without this handler the request
      // never resolves. Reject so App.vue's boot try/catch can surface
      // a recovery affordance instead of hanging on the spinner.
      req.onblocked = () => {
        console.error(
          `[IndexedDB] open blocked on "${dbName}" — another tab holds an older version. Close other tabs and reload.`,
        )
        settleReject(
          new Error(
            `IndexedDB open blocked on "${dbName}". Close other tabs of this app and reload.`,
          ),
        )
      }
      // Hard backstop. Some browser+OS combos drop IDB callbacks
      // entirely (private mode, quota exhaustion, OS-level lock).
      // 10s is plenty for a v1 open; anything past that is a stuck
      // request and the user is better off seeing the recovery UI.
      setTimeout(() => {
        settleReject(new Error(`IndexedDB open timed out for "${dbName}" after 10s`))
      }, 10000)
    })
  }

  /**
   * Close the current database connection so init() can reopen a different DB.
   */
  static close() {
    if (IndexedDB.#db) {
      IndexedDB.#db.close()
      IndexedDB.#db = null
      IndexedDB.#currentDbName = null
    }
  }

  /**
   * Persist a record to a model store.
   * @param {string} storeName
   * @param {object} record - must have `id` field
   */
  static async put(storeName, record) {
    return new Promise((resolve, reject) => {
      const tx = IndexedDB.#db.transaction(storeName, TX_MODE.READWRITE)
      const store = tx.objectStore(storeName)
      const req = store.put(record)
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => resolve(record)
    })
  }

  /**
   * Retrieve a record by id from a model store.
   * @param {string} storeName
   * @param {*} id
   * @returns {Promise<object|null>}
   */
  static async get(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx = IndexedDB.#db.transaction(storeName, TX_MODE.READONLY)
      const store = tx.objectStore(storeName)
      const req = store.get(id)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result ?? null)
    })
  }

  /**
   * Retrieve all records from a model store.
   * @param {string} storeName
   * @returns {Promise<object[]>}
   */
  static async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = IndexedDB.#db.transaction(storeName, TX_MODE.READONLY)
      const store = tx.objectStore(storeName)
      const req = store.getAll()
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result ?? [])
    })
  }

  /**
   * Persist multiple records to a model store.
   * @param {string} storeName
   * @param {object[]} records - array of records, each must have `id` field
   */
  static async bulkPut(storeName, records) {
    return new Promise((resolve, reject) => {
      const tx = IndexedDB.#db.transaction(storeName, TX_MODE.READWRITE)
      const store = tx.objectStore(storeName)
      for (const record of records) {
        store.put(record)
      }
      tx.oncomplete = () => resolve(records)
      tx.onerror = () => reject(tx.error)
    })
  }

  /**
   * Delete a record by id from a model store.
   * @param {string} storeName
   * @param {*} id
   */
  static async delete(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx = IndexedDB.#db.transaction(storeName, TX_MODE.READWRITE)
      const store = tx.objectStore(storeName)
      const req = store.delete(id)
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => resolve()
    })
  }

  /**
   * Get all records matching a specific index value.
   * @param {string} storeName
   * @param {string} indexName
   * @param {*} value
   * @returns {Promise<object[]>}
   */
  static async getByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const tx = IndexedDB.#db.transaction(storeName, TX_MODE.READONLY)
      const store = tx.objectStore(storeName)
      const index = store.index(indexName)
      const req = index.getAll(value)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result ?? [])
    })
  }

  /**
   * Get all records matching any of several index values (SQL IN-style).
   * Runs one `getAll` per value inside a single readonly transaction and
   * deduplicates results by the store's primary key.
   * @param {string} storeName
   * @param {string} indexName
   * @param {Array<*>} values
   * @returns {Promise<object[]>}
   */
  static async getByIndexMulti(storeName, indexName, values) {
    if (values.length === 0) return []
    if (values.length === 1) return IndexedDB.getByIndex(storeName, indexName, values[0])

    return new Promise((resolve, reject) => {
      const tx = IndexedDB.#db.transaction(storeName, TX_MODE.READONLY)
      const store = tx.objectStore(storeName)
      const index = store.index(indexName)
      const pkPath = store.keyPath
      const seen = new Set()
      const results = []

      for (let i = 0; i < values.length; i++) {
        const val = values[i]
        const req = index.getAll(val)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          for (const record of req.result) {
            const pk = record[pkPath]
            if (!seen.has(pk)) {
              seen.add(pk)
              results.push(record)
            }
          }
          if (i === values.length - 1) resolve(results)
        }
      }
    })
  }

  /**
   * Cursor-based scan with per-record filter. Avoids loading the entire store into memory.
   * @param {string} storeName
   * @param {(record: object) => boolean} filterFn
   * @param {{ limit?: number|null, offset?: number }} [options]
   * @returns {Promise<object[]>}
   */
  static async scan(storeName, filterFn, { limit = null, offset = 0 } = {}) {
    return new Promise((resolve, reject) => {
      const tx = IndexedDB.#db.transaction(storeName, TX_MODE.READONLY)
      const store = tx.objectStore(storeName)
      const req = store.openCursor()
      const results = []
      let skipped = 0

      req.onerror = () => reject(req.error)
      req.onsuccess = (event) => {
        const cursor = event.target.result
        if (!cursor) {
          resolve(results)
          return
        }

        if (filterFn(cursor.value)) {
          if (skipped < offset) {
            skipped++
          } else {
            results.push(cursor.value)
            if (limit !== null && results.length >= limit) {
              resolve(results)
              return
            }
          }
        }

        cursor.continue()
      }
    })
  }

  /**
   * Create all object stores at version 1.
   * @param {IDBDatabase} db
   */
  static ensureSchema(_db) {}
}
