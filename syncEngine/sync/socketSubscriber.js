/**
 * socketSubscriber — listens to 'sync' events from the backend via socket.io,
 * fetches the updated record from GraphQL, writes to IDB, and emits syncBus.
 *
 * Runs on the main thread (replaces sw/src/socketHandler.js).
 * Reuses the existing app socket from src/api/socket.js — no new connection created.
 *
 * Echo suppression: after our own save() writes a record, we mark it as recently
 * written for ECHO_TTL_MS so the redundant server-push for the same record is ignored.
 */

import { IndexedDB } from '../persistence/IndexedDB.js'
import { MetaCache } from '../core/MetaCache.js'
import { MutationRunner } from '../network/MutationRunner.js'
import { syncBus } from '../core/syncBus.js'
import { syncMetaStore } from '../persistence/syncMetaStore.js'
import { toCamelCase } from '../utils/changeCase.js'

/** How long (ms) to suppress echo events after a local save. */
const ECHO_TTL_MS = 2000

/** @type {Set<string>} keys formatted as `modelName:pkValue` */
const recentlyWritten = new Set()

/** @type {((payload: object) => Promise<void>)|null} active listener reference for cleanup */
let activeSyncHandler = null

/**
 * Tables that signal rather than sync: a change to them must wake the app, but
 * there is no record to fetch and nothing to cache.
 *
 * `authz.role_module_permissions` holds every grant in the tenant. It has no
 * `@ClientModel` and cannot have one — PostGraphile runs `schemas: ['public']`,
 * so a table in the `authz` schema has no GraphQL type to fetch through. Without
 * this map its event hits `if (!meta) return` below and is dropped, which is why
 * a permission change never reached the browser it affected (F-03 in
 * docs/modules/roles): the server enforced the new grants immediately while the
 * SPA kept rendering buttons the holder had just lost.
 *
 * The value is the `syncBus` key subscribers listen on — see
 * `src/utils/permissionSync.js`. Emit the fact, never the row.
 *
 * @type {Record<string, string>} postgres table name → syncBus key
 */
export const SIGNAL_ONLY_TABLES = {
  role_module_permissions: 'RoleModulePermission',
}

function markWritten(key) {
  recentlyWritten.add(key)
  setTimeout(() => recentlyWritten.delete(key), ECHO_TTL_MS)
}

/**
 * Attach the 'sync' listener to a socket.io instance.
 * Replaces any previously attached listener to prevent duplicates on re-init.
 * @param {import('socket.io-client').Socket} socket
 */
function attachSyncListener(socket) {
  // Remove previous handler if any
  if (activeSyncHandler) {
    socket.off('sync', activeSyncHandler)
  }

  activeSyncHandler = async function handleSync(payload) {
    const { table: tableNameInPostgres, action, pkValue } = payload
    if (!tableNameInPostgres || !action || !pkValue) return

    // Signal-only tables carry no record — emit the fact and stop. Checked
    // before the MetaCache lookup because these deliberately have no model.
    const signalKey = SIGNAL_ONLY_TABLES[tableNameInPostgres]
    if (signalKey) {
      syncBus.emit({ modelName: signalKey, modelId: pkValue, action, type: 'sync' })
      return
    }

    const meta = MetaCache.getByTable(toCamelCase(tableNameInPostgres))
    if (!meta) return

    // IndexedDB store name is the model's OWN tableName, NOT the raw postgres
    // table name from the socket. They diverge for uncountable-noun tables
    // (postgres `equipment` vs the IDB store `equipments`); using the socket
    // name here would put()/delete() against the wrong/nonexistent store and the
    // fetched record would never reach the live query.
    const tableName = meta.tableName

    const echoKey = `${meta.modelName}:${pkValue}`
    if (recentlyWritten.has(echoKey)) return

    try {
      let resolvedAction = action

      if (action === 'create' || action === 'update') {
        const record = await MutationRunner.fetchOne(meta, pkValue)
        if (record) {
          await IndexedDB.put(tableName, record)

          // Update sync watermark
          if (meta.syncField) {
            const newVal = record[meta.syncField]
            if (newVal != null) {
              const current = await syncMetaStore.get(meta.modelName)
              if (current === null || newVal > current) {
                await syncMetaStore.set(meta.modelName, newVal)
              }
            }
          }
        } else {
          // Record deleted or access revoked — remove from IDB
          await IndexedDB.delete(tableName, pkValue)
          resolvedAction = 'delete'
        }
      } else if (action === 'delete') {
        await IndexedDB.delete(tableName, pkValue)
      }

      syncBus.emit({
        modelName: meta.modelName,
        modelId: pkValue,
        action: resolvedAction,
        type: 'sync',
      })
    } catch (err) {
      console.error('[socketSubscriber] Sync error:', err)
    }
  }

  socket.on('sync', activeSyncHandler)
}

/**
 * Initialize the socket subscriber.
 * Dynamically imports the app socket to avoid circular module dependencies.
 * If the socket is already connected, attaches immediately;
 * otherwise waits for the first 'connect' event.
 */
export function initSocketSubscriber() {
  import('../../src/api/socket.js')
    .then(({ getSocket }) => {
      const socket = getSocket()
      if (!socket) {
        console.warn('[socketSubscriber] No socket available — sync events will not be received')
        return
      }
      if (socket.connected) {
        attachSyncListener(socket)
      } else {
        socket.once('connect', () => attachSyncListener(socket))
      }
    })
    .catch((err) => console.error('[socketSubscriber] Failed to init socket subscriber:', err))
}

/**
 * Tear down the subscriber (called on syncEngine.teardown()).
 * Removes the listener so it can be re-attached on the next initSocketSubscriber() call.
 */
export function teardownSocketSubscriber() {
  import('../../src/api/socket.js')
    .then(({ getSocket }) => {
      const socket = getSocket()
      if (socket && activeSyncHandler) {
        socket.off('sync', activeSyncHandler)
      }
    })
    .catch(() => {})
  activeSyncHandler = null
}

/**
 * Mark a model instance as recently written by our own save().
 * Call this immediately after a successful mutation to suppress the server echo.
 *
 * @param {string} modelName
 * @param {string|number} id
 */
export function markAsRecentlyWritten(modelName, id) {
  markWritten(`${modelName}:${id}`)
}
