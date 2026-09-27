/**
 * Fetch a specific slice of a model NOW, ignoring the delta-sync watermark.
 *
 * ── The gap this closes ─────────────────────────────────────────────────────
 * bootstrapModel is a DELTA sync: it asks only for rows whose syncField is
 * greater than the watermark stored for that model. That is correct for
 * keeping up with changes, and wrong for one case it cannot see — a row that
 * was always there and has just become VISIBLE to this user.
 *
 * Visibility is decided by RLS, and gaining it does not touch the row. So
 * `updated_at` stays where it was, below the client's watermark, and the delta
 * sync never asks for it again. The client is not stale in any way it can
 * detect: it has every row it was ever entitled to fetch.
 *
 * Reported 2026-09-27 on document approval, which shows the shape clearly.
 * Submitting for approval touches `documents` and `document_versions` (the
 * status changes) and mints the approver's task, so all three arrive on the
 * next delta. `document_sections` were written when the author typed them and
 * are untouched by the submit — so the approver opened the document and found
 * every section empty. Nothing errored; there was simply no content, and the
 * natural reading is "the document is blank", not "your client never asked for
 * these rows".
 *
 * It is not specific to documents. Any record whose children predate the
 * moment you were given access has the same hole: workflow steps on a record
 * you were just added to, sections of a module record, an audit's findings.
 *
 * ── Why this, rather than touching rows or widening RLS ─────────────────────
 * Bumping `updated_at` on assignment would make every grant write to every
 * child row, and broadcast them to everyone already watching — expensive, and
 * it forges a modification timestamp on records that Part 11 expects to mean
 * something. Widening the RLS policies would change WHO can read WHAT to fix a
 * problem that is not about permission at all: the server already says yes.
 *
 * The client simply has to ask. A detail page knows exactly which rows it
 * needs, so it asks for those and nothing else.
 *
 * ── The watermark is deliberately NOT advanced ──────────────────────────────
 * This fetches a SUBSET. Advancing the model's watermark to the newest row in
 * that subset would tell the next delta sync that everything older is already
 * held — which is false for every other row in the table. The watermark
 * belongs to bootstrapModel, which alone fetches enough to justify moving it.
 */
import { IndexedDB } from '../persistence/IndexedDB.js'
import { MetaCache } from '../core/MetaCache.js'
import { graphqlRequest } from '../network/graphqlClient.js'
import { syncBus } from '../core/syncBus.js'
import pluralize from 'pluralize-esm'

const PAGE_SIZE = 200

/**
 * @param {string} modelName  e.g. 'DocumentSection'
 * @param {object} filter     PostGraphile filter, e.g. { documentId: { equalTo: id } }
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<number>} rows written
 */
export async function hydrateSubtree(modelName, filter, { signal } = {}) {
  const meta = MetaCache.get(modelName)
  // A LOCAL-strategy model has no MetaCache entry and nothing to fetch. Return
  // rather than throw: callers list the models a page needs, and one of them
  // going local should not break the page.
  if (!meta || !filter) return 0

  let after = null
  let total = 0

  while (true) {
    if (signal?.aborted) throw new DOMException('Hydrate aborted', 'AbortError')

    const variables = { first: PAGE_SIZE, filter }
    if (after) variables.after = after

    const data = await graphqlRequest(meta.fetchAll, variables, { signal })
    const collection = data[pluralize(meta.tableName)]
    const nodes = collection?.nodes ?? []
    const pageInfo = collection?.pageInfo ?? {}

    if (nodes.length > 0) {
      await IndexedDB.bulkPut(meta.tableName, nodes)
      total += nodes.length
    }

    if (!pageInfo.hasNextPage || !pageInfo.endCursor) break
    after = pageInfo.endCursor
  }

  // Emit even at zero: a live query that rendered an empty list while the
  // fetch was in flight has nothing else to tell it the answer is in.
  syncBus.emit({ type: 'hydrate', modelName: meta.modelName, count: total })
  return total
}

/**
 * Hydrate several models for one record, in parallel.
 *
 * Rejections are swallowed per model, deliberately. This runs on page open as
 * a repair for rows the client could not know it was missing; one model
 * failing (offline, a permission the server declines) must not stop the others
 * or surface an error on a page that is otherwise working from IDB.
 *
 * @param {Array<[string, object]>} pairs [modelName, filter][]
 */
export async function hydrateAll(pairs, { signal } = {}) {
  const results = await Promise.allSettled(
    pairs.map(([modelName, filter]) => hydrateSubtree(modelName, filter, { signal })),
  )
  return results.reduce((n, r) => n + (r.status === 'fulfilled' ? r.value : 0), 0)
}
