import { syncEngine } from '@syncEngine/syncEngine.js'
import '@models/index.js'

const DB_PREFIX = 'qms-'

/**
 * Install (or reinstall) the syncEngine with a company-scoped IndexedDB.
 * Must be called after connectSocket() so the socket is available for the subscriber.
 * @param {string} companyId
 */
export async function initSync(companyId) {
  if (!companyId) return

  await syncEngine.install({
    dbName: `${DB_PREFIX}${companyId}`,
  })
}

/**
 * Teardown the current syncEngine (close IDB, stop SW, clear pool).
 */
export function teardownSync() {
  syncEngine.teardown()
}

/**
 * Delete all qms-* IndexedDB databases.
 * Called on logout to wipe offline data.
 */
export async function deleteAllSyncDatabases() {
  teardownSync()

  if (!indexedDB.databases) return // unsupported browser fallback

  const databases = await indexedDB.databases()
  const deletions = databases
    .filter((db) => db.name?.startsWith(DB_PREFIX))
    .map(
      (db) =>
        new Promise((resolve) => {
          const req = indexedDB.deleteDatabase(db.name)
          // Resolve only when the DB is truly gone. Do NOT resolve on
          // `onblocked` — that fires while a lingering connection keeps
          // the delete *pending*; if the caller then reloads, the fresh
          // page reopens the same DB mid-delete and IndexedDB deadlocks
          // (black screen). Wait for `onsuccess` once the connection
          // closes; a hard timeout guarantees we never hang the refresh.
          let settled = false
          const done = () => {
            if (settled) return
            settled = true
            resolve()
          }
          req.onsuccess = done
          req.onerror = done // best-effort — don't block logout/refresh
          req.onblocked = () => {} // keep waiting; onsuccess fires once unblocked
          setTimeout(done, 3000)
        }),
    )

  await Promise.all(deletions)
}
