/**
 * Force the SyncEngine to refetch a single record from the server and
 * update IDB + notify live queries — without going through the local
 * BaseModel mutation path.
 *
 * Use when a REST endpoint (not SyncEngine GraphQL mutation) changes a
 * row server-side and the client cache needs to pick up the new state
 * before the natural sync push lands. Example: POST
 * /v1/services/fieldRecords/:id/review updates the row but the
 * preview's live query still shows UNDER_REVIEW until something
 * forces a refetch.
 *
 * Mirrors the body of socketSubscriber.processSyncEvent's update
 * branch, but callable directly from a component handler.
 */

import { MetaCache, ModelRegistry, IndexedDB, syncBus } from '@syncEngine/index'
import { MutationRunner } from '@syncEngine/network/MutationRunner'

/**
 * @param {string} modelName  JS class name, e.g. 'FieldRecord'
 * @param {string} id         primary key value
 * @returns {Promise<object|null>} the refetched row (or null if it no longer exists / user lost access)
 */
export async function refetchSyncRecord(modelName, id) {
  const meta = MetaCache.get(modelName)
  if (!meta) return null
  const tableName = ModelRegistry.getTableName(modelName)
  const record = await MutationRunner.fetchOne(meta, id)
  if (record) {
    await IndexedDB.put(tableName, record)
    syncBus.emit({ modelName, modelId: id, action: 'update', type: 'sync' })
  } else {
    await IndexedDB.delete(tableName, id)
    syncBus.emit({ modelName, modelId: id, action: 'delete', type: 'sync' })
  }
  return record
}
