/**
 * bootstrap — initial (delta-sync) data load for all INSTANT/LAZY models.
 *
 * Runs on the main thread (replaces sw/src/bootstrap.js).
 * Uses paginated GraphQL queries with a lastSyncValue watermark for delta-sync.
 * Progress is emitted via syncBus so live queries and UI progress bars can react.
 */

import { IndexedDB } from '../persistence/IndexedDB.js'
import { MetaCache } from '../core/MetaCache.js'
import { graphqlRequest } from '../network/graphqlClient.js'
import { syncMetaStore } from '../persistence/syncMetaStore.js'
import { syncBus } from '../core/syncBus.js'
import pluralize from 'pluralize-esm'

const PAGE_SIZE = 100

/**
 * Bootstrap all INSTANT models in parallel.
 * Emits `bootstrapComplete` on syncBus when done (or skipped when offline).
 *
 * @param {AbortSignal} [signal]
 * @returns {Promise<boolean>} true if skipped (offline), false if ran
 */
export async function bootstrapAll(signal) {
  if (!navigator.onLine) {
    syncBus.emit({ type: 'bootstrapComplete', skipped: true, reason: 'offline' })
    return true
  }

  const allMetas = MetaCache.all()

  const results = await Promise.allSettled(allMetas.map((meta) => bootstrapModel(meta, signal)))

  const failures = allMetas
    .map((meta, i) => ({ meta, result: results[i] }))
    .filter(({ result }) => result.status === 'rejected')

  // Surface every failing model + its error in the browser console.
  // Silent allSettled() previously made schema-drift (e.g. server doesn't
  // know a field we added; PostGraphile hasn't re-introspected) look
  // like "FE just shows nothing". Now you can grep the console.
  for (const { meta, result } of failures) {
    // eslint-disable-next-line no-console
    console.error(
      `[syncEngine bootstrap] ${meta.modelName} failed:`,
      result.reason?.message || result.reason,
    )
  }

  const failed = failures.map(({ meta }) => meta.modelName)
  syncBus.emit({ type: 'bootstrapComplete', ...(failed.length > 0 ? { failed } : {}) })

  for (const modelName of failed) {
    syncBus.emit({ type: 'bootstrap', modelName, count: 0, error: 'Bootstrap failed' })
  }

  return false
}

/**
 * Fetch all pages for a single model and upsert nodes into IDB.
 * Uses the stored lastSyncValue for delta-sync (only fetches records newer than watermark).
 *
 * @param {object} meta - MetaCache entry
 * @param {AbortSignal} [signal]
 */
async function bootstrapModel(meta, signal) {
  let after = null
  let totalCount = 0

  const lastSyncValue = await syncMetaStore.get(meta.modelName)
  let maxSyncValue = lastSyncValue

  while (true) {
    if (signal?.aborted) throw new DOMException('Bootstrap aborted', 'AbortError')

    const variables = { first: PAGE_SIZE }

    if (after) variables.after = after

    if (meta.syncField && lastSyncValue !== null) {
      variables.filter = { [meta.syncField]: { greaterThan: lastSyncValue } }
    }

    if (meta.syncField && meta.fetchAllOrderBy) {
      variables.orderBy = [meta.fetchAllOrderBy]
    }

    const data = await graphqlRequest(meta.fetchAll, variables, { signal })
    const collection = data[pluralize(meta.tableName)]
    const nodes = collection?.nodes ?? []
    const pageInfo = collection?.pageInfo ?? {}

    if (nodes.length > 0) {
      await IndexedDB.bulkPut(meta.tableName, nodes)
      totalCount += nodes.length

      if (meta.syncField) {
        for (const node of nodes) {
          const val = node[meta.syncField]
          if (val != null && (maxSyncValue === null || val > maxSyncValue)) {
            maxSyncValue = val
          }
        }
      }
    }

    if (!pageInfo.hasNextPage || !pageInfo.endCursor) {
      if (meta.syncField && maxSyncValue !== lastSyncValue) {
        await syncMetaStore.set(meta.modelName, maxSyncValue)
      }
      syncBus.emit({ type: 'bootstrap', modelName: meta.modelName, count: totalCount })
      return
    }

    after = pageInfo.endCursor
  }
}
