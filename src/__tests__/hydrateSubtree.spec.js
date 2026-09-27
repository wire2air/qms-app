/**
 * Targeted hydration — fetching rows the delta sync will never ask for again.
 *
 * ORIGINAL REPORT (2026-09-27): an approver opened a document submitted for
 * approval and every section was empty. Granting them full document_control
 * "fixed" it, which pointed at permissions; it was not a permission problem.
 *
 * bootstrapModel asks only for rows whose syncField is greater than a stored
 * per-model watermark. Gaining ACCESS to a record does not touch the record,
 * so `updated_at` stays below the watermark and those rows are never requested
 * again. Submitting for approval touches the document and its version (the
 * status changes) and mints the task — so those arrive and the document opens
 * — while the sections, untouched since the author typed them, do not.
 *
 * The two claims that matter are pinned here:
 *   1. the fetch carries the CALLER's filter and no watermark clause;
 *   2. it does NOT advance the watermark, because it fetched a subset.
 *
 * (2) is the one that would be silently catastrophic. Advancing the model's
 * watermark to the newest row of a one-document slice would tell the next
 * delta sync that every older row company-wide is already held — turning a
 * repair into a much larger hole than the one it fixes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const graphqlRequest = vi.fn()
const bulkPut = vi.fn()
const syncMetaSet = vi.fn()
const emit = vi.fn()

vi.mock('@syncEngine/network/graphqlClient.js', () => ({ graphqlRequest }))
vi.mock('@syncEngine/persistence/IndexedDB.js', () => ({ IndexedDB: { bulkPut } }))
vi.mock('@syncEngine/persistence/syncMetaStore.js', () => ({
  syncMetaStore: { get: vi.fn(async () => 999), set: syncMetaSet },
}))
vi.mock('@syncEngine/core/syncBus.js', () => ({ syncBus: { emit } }))
vi.mock('@syncEngine/core/MetaCache.js', () => ({
  MetaCache: {
    get: (name) =>
      name === 'Missing'
        ? null
        : {
            modelName: name,
            tableName: 'documentSections',
            syncField: 'updatedAt',
            fetchAll: 'QUERY',
          },
  },
}))

const { hydrateSubtree, hydrateAll } = await import('@syncEngine/sync/hydrateSubtree.js')

function page(nodes, hasNextPage = false, endCursor = null) {
  return { documentSections: { nodes, pageInfo: { hasNextPage, endCursor } } }
}

beforeEach(() => vi.clearAllMocks())

describe('hydrateSubtree', () => {
  it('sends the caller’s filter and no watermark clause — the whole point', async () => {
    graphqlRequest.mockResolvedValueOnce(page([{ id: 's1' }]))

    await hydrateSubtree('DocumentSection', { documentId: { equalTo: 'doc-1' } })

    const [, variables] = graphqlRequest.mock.calls[0]
    expect(variables.filter).toEqual({ documentId: { equalTo: 'doc-1' } })
    // A `greaterThan` on the syncField is exactly what makes delta sync skip
    // these rows. Its presence here would reproduce the bug.
    expect(JSON.stringify(variables.filter)).not.toContain('greaterThan')
  })

  it('does NOT advance the watermark — it fetched a subset', async () => {
    graphqlRequest.mockResolvedValueOnce(page([{ id: 's1', updatedAt: 5000 }]))

    await hydrateSubtree('DocumentSection', { documentId: { equalTo: 'doc-1' } })

    expect(syncMetaSet).not.toHaveBeenCalled()
  })

  it('writes what it fetched and tells live queries', async () => {
    graphqlRequest.mockResolvedValueOnce(page([{ id: 's1' }, { id: 's2' }]))

    const n = await hydrateSubtree('DocumentSection', { documentId: { equalTo: 'doc-1' } })

    expect(n).toBe(2)
    expect(bulkPut).toHaveBeenCalledWith('documentSections', [{ id: 's1' }, { id: 's2' }])
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'hydrate', modelName: 'DocumentSection', count: 2 }),
    )
  })

  it('follows pagination to the end', async () => {
    graphqlRequest
      .mockResolvedValueOnce(page([{ id: 's1' }], true, 'cur1'))
      .mockResolvedValueOnce(page([{ id: 's2' }]))

    const n = await hydrateSubtree('DocumentSection', { documentId: { equalTo: 'doc-1' } })

    expect(n).toBe(2)
    expect(graphqlRequest.mock.calls[1][1].after).toBe('cur1')
  })

  it('emits even when nothing came back', async () => {
    // A live query that rendered an empty list while the fetch was in flight
    // has nothing else to tell it the answer is in.
    graphqlRequest.mockResolvedValueOnce(page([]))

    await hydrateSubtree('DocumentSection', { documentId: { equalTo: 'doc-1' } })

    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ count: 0 }))
  })

  it('is inert for an unknown or LOCAL-strategy model rather than throwing', async () => {
    const n = await hydrateSubtree('Missing', { documentId: { equalTo: 'doc-1' } })
    expect(n).toBe(0)
    expect(graphqlRequest).not.toHaveBeenCalled()
  })

  it('is inert without a filter — it must never fetch a whole table', async () => {
    const n = await hydrateSubtree('DocumentSection', null)
    expect(n).toBe(0)
    expect(graphqlRequest).not.toHaveBeenCalled()
  })
})

describe('hydrateAll', () => {
  it('one model failing does not stop the others', async () => {
    // Runs on page open as a repair. An offline model, or one the server
    // declines, must not break a page that is otherwise working from IDB.
    graphqlRequest
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page([{ id: 's1' }]))

    const n = await hydrateAll([
      ['DocumentVersion', { documentId: { equalTo: 'doc-1' } }],
      ['DocumentSection', { documentId: { equalTo: 'doc-1' } }],
    ])

    expect(n).toBe(1)
  })
})
