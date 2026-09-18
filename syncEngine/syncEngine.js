import { BaseModel } from './core/BaseModel.js'
import { IndexedDB } from './persistence/IndexedDB.js'
import { MetaCache } from './core/MetaCache.js'
import { ObjectPool } from './core/ObjectPool.js'
import { directSaveStrategy } from './core/directSaveStrategy.js'
import { bootstrapAll } from './sync/bootstrap.js'
import {
  shouldBootstrap,
  markBootstrapStarted,
  markBootstrapComplete,
  clearBootstrapGate,
} from './sync/bootstrapGate.js'
import { initSocketSubscriber, teardownSocketSubscriber } from './sync/socketSubscriber.js'
import { shouldNuke, computeSchemaHash } from './persistence/schemaManager.js'
import { DB_NAME, SCHEMA_HASH_KEY } from './shared/constants.js'

export class SyncEngine {
  /**
   * @type {string}
   */
  #rawDbName = null

  /**
   * Set when a schema change is detected. Holds the old DB name to nuke after the new one opens.
   * @type {string|null}
   */
  #dbToNuke = null

  /**
   * DB name key in localStorage (scoped to rawDbName to avoid collisions).
   */
  get #dbNameKey() {
    return `${this.#rawDbName}_dbName`
  }

  /**
   * The active company-scoped IDB name, persisted in localStorage so it survives page reloads.
   * @type {string|null}
   */
  get dbName() {
    return localStorage.getItem(this.#dbNameKey) || null
  }
  set dbName(name) {
    localStorage.setItem(this.#dbNameKey, name)
  }

  /**
   * Install the syncEngine for a given company.
   *
   * Steps:
   *   1. Open (or create) the company-scoped IndexedDB.
   *   2. Build the in-memory MetaCache (GraphQL strings per model).
   *   3. Wire BaseModel._saveStrategy to call the API directly.
   *   4. Run the paginated delta-sync bootstrap (non-blocking).
   *   5. Attach the socket.io 'sync' listener for server-push updates.
   *
   * @param {{ dbName?: string }} [options]
   */
  async install({ dbName = DB_NAME } = {}) {
    this.#rawDbName = dbName
    await this.#initDatabase(dbName)

    // Build in-memory GraphQL string cache (replaces TableMetaService IDB store)
    MetaCache.build()

    // Wire direct-API save strategy (replaces SyncTransaction + TransactionQueue + SW poll)
    BaseModel._saveStrategy = directSaveStrategy

    // Bootstrap: paginated delta-sync for all INSTANT models (non-blocking).
    // Gated by bootstrapGate: skips if another tab is in progress or data is < 5 min old.
    if (shouldBootstrap(this.dbName)) {
      markBootstrapStarted(this.dbName)
      bootstrapAll()
        .then(() => markBootstrapComplete(this.dbName))
        .catch((err) => {
          clearBootstrapGate(this.dbName)
          console.error('[SyncEngine] Bootstrap error:', err)
        })
    }

    // Socket subscriber: server-push sync via the existing app socket
    initSocketSubscriber()

    // Orphan-DB sweep. Each schema-change cycle mints a new timestamped
    // DB and tries to delete the previous one in #nukeDatabaseIfNeeded();
    // if that delete was blocked by a sibling tab, the old DB stays as
    // an orphan and every later boot accumulates one more. Sweep all
    // qms-X-* DBs that aren't the active one in the background — keeps
    // the IDB list tidy and shrinks the surface for future block races.
    // Fire-and-forget; never block the user on cleanup.
    this.#sweepOrphanDatabases().catch((err) =>
      console.warn('[SyncEngine] Orphan sweep failed', err),
    )
  }

  async #sweepOrphanDatabases() {
    if (!indexedDB.databases) return // older browsers — no enumeration API

    const databases = await indexedDB.databases()
    const active = this.dbName
    const prefix = `${this.#rawDbName}-`
    const orphans = databases
      .map((db) => db.name)
      .filter((name) => name && name.startsWith(prefix) && name !== active)

    if (orphans.length === 0) return
    console.log(
      `[SyncEngine] Sweeping ${orphans.length} orphan database(s):`,
      orphans,
    )

    for (const name of orphans) {
      const req = indexedDB.deleteDatabase(name)
      req.onsuccess = () => console.log(`[SyncEngine] Swept orphan: ${name}`)
      req.onerror = () =>
        console.warn(`[SyncEngine] Orphan delete failed: ${name}`, req.error)
      // onblocked is informational only — if the orphan is held open
      // by a sibling tab, our IndexedDB.init's onversionchange listener
      // there will close it eagerly, and this delete will land then.
      req.onblocked = () =>
        console.warn(
          `[SyncEngine] Orphan delete blocked (sibling tab holds connection): ${name}`,
        )
    }
  }

  async #initDatabase(dbName) {
    if (shouldNuke()) {
      this.#dbToNuke = this.dbName
    }

    if (!this.dbName || this.#dbToNuke !== null) {
      // First run or schema change — create a new timestamped DB
      this.dbName = `${dbName}-${Date.now()}`
    }

    await IndexedDB.init(this.dbName)
    localStorage.setItem(SCHEMA_HASH_KEY, computeSchemaHash())

    // Nuke the old DB immediately after the new one is open
    this.#nukeDatabaseIfNeeded()
  }

  #nukeDatabaseIfNeeded() {
    if (this.#dbToNuke) {
      const toNuke = this.#dbToNuke
      this.#dbToNuke = null
      const req = indexedDB.deleteDatabase(toNuke)
      req.onsuccess = () => console.log(`[SyncEngine] Nuked old database: ${toNuke}`)
      req.onerror = () =>
        console.error(`[SyncEngine] Failed to nuke database: ${toNuke}`, req.error)
      req.onblocked = () =>
        console.warn(`[SyncEngine] DB delete blocked by open connections: ${toNuke}`)
    }
  }

  /**
   * Teardown the engine — detach socket listener, close IDB, clear in-memory pool.
   * Call before switching to a different company DB or on logout.
   */
  teardown() {
    if (this.dbName) clearBootstrapGate(this.dbName)
    teardownSocketSubscriber()
    BaseModel._saveStrategy = null
    IndexedDB.close()
    ObjectPool.clear()
  }
}

export const syncEngine = new SyncEngine()
