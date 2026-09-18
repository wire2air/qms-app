// A compound index is NOT reachable under its first field's name.
//
// `parseCustomIndex` names a compound index with the bracketed string it was
// declared as — `[fromType+fromId]` — and `IndexedDB.ensureSchema` passes that
// straight to `store.createIndex(idx.name, idx.fields)`. So the IDB store has
// an index called `'[fromType+fromId]'` and no index called `'fromType'`.
//
// `ModelRegistry.hasIndex` used to answer `true` for a compound index's FIRST
// FIELD. That made `QueryBuilder` take its indexed fast path and call
// `store.index('fromType')`, which throws NotFoundError — swallowed by
// `useLiveQuery`'s try/catch, leaving the query pinned to its `initial` value
// forever. Three live screens sat blank on this (Quality Events home +
// dashboard, QA Complaints home) and a fourth worked around it at the call
// site (SuppliersSharedDocumentsTab).
//
// Two layers, because either alone is weak:
//   1. behaviour — prove the routing decision against the real QueryBuilder,
//      so this tests the mechanism and not a string;
//   2. declaration — prove real models still declare compound-only prefixes,
//      so layer 1 cannot quietly become a test of a situation that no longer
//      occurs.
//
// Layer 2 is a source scan on purpose: `models/*.js` use legacy decorators
// that need vite-plugin-babel, which the lighter vitest config does not load,
// so the classes cannot be imported here.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

vi.mock('../../syncEngine/persistence/IndexedDB.js', () => ({
  IndexedDB: {
    scan: vi.fn(() => Promise.resolve([])),
    getByIndex: vi.fn(() => Promise.resolve([])),
    getByIndexMulti: vi.fn(() => Promise.resolve([])),
  },
}))

vi.mock('../../syncEngine/persistence/hydration.js', () => ({
  hydrate: (_modelName, _id, _opts, record) => Promise.resolve(record),
}))

const { IndexedDB } = await import('../../syncEngine/persistence/IndexedDB.js')
const { QueryBuilder } = await import('../../syncEngine/query/QueryBuilder.js')
const { default: ModelRegistry } = await import('../../syncEngine/core/ModelRegistry.js')
const { parseCustomIndex } = await import('../../syncEngine/utils/parseCustomIndex.js')

const MODELS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../models')

// Registered through the real DSL parser so the fixture cannot drift from the
// shape `@ClientModel({ customIndex })` actually produces.
const FIXTURE = 'RecordLinkIndexFixture'
ModelRegistry.register(
  FIXTURE,
  class {},
  [],
  undefined,
  1,
  parseCustomIndex('companyId, [fromType+fromId], [toType+toId]'),
  'id',
  'updatedAt',
  'recordLinks',
)

describe('ModelRegistry.hasIndex', () => {
  it('reports a genuine single index', () => {
    expect(ModelRegistry.hasIndex(FIXTURE, 'companyId')).toBe(true)
  })

  it('does NOT report a compound index under its first field', () => {
    expect(ModelRegistry.hasIndex(FIXTURE, 'fromType')).toBe(false)
    expect(ModelRegistry.hasIndex(FIXTURE, 'toType')).toBe(false)
  })

  it('does not report a non-leading member of a compound index either', () => {
    expect(ModelRegistry.hasIndex(FIXTURE, 'fromId')).toBe(false)
  })

  it('does not report an undeclared field', () => {
    expect(ModelRegistry.hasIndex(FIXTURE, 'relation')).toBe(false)
  })
})

describe('parseCustomIndex names compound indexes the way createIndex does', () => {
  it('keeps the bracketed form as the index name', () => {
    const [single, compound] = parseCustomIndex('companyId, [fromType+fromId]')
    expect(single).toMatchObject({ type: 'single', field: 'companyId', name: 'companyId' })
    // The name is what ensureSchema passes to store.createIndex — it is NOT
    // 'fromType', which is the whole reason hasIndex must not match on it.
    expect(compound).toMatchObject({
      type: 'compound',
      fields: ['fromType', 'fromId'],
      name: '[fromType+fromId]',
    })
  })
})

describe('QueryBuilder routing (the path the bug actually took)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the indexed path for a genuine single index', async () => {
    await new QueryBuilder(FIXTURE, 'companyId', 'c1').exec()

    expect(IndexedDB.getByIndex).toHaveBeenCalledWith('recordLinks', 'companyId', 'c1')
    expect(IndexedDB.scan).not.toHaveBeenCalled()
  })

  it('uses the indexed path for an explicit compound index name', async () => {
    await new QueryBuilder(FIXTURE, '[fromType+fromId]', ['QualityEvent', 'qe1']).exec()

    expect(IndexedDB.getByIndex).toHaveBeenCalledWith('recordLinks', '[fromType+fromId]', [
      'QualityEvent',
      'qe1',
    ])
    expect(IndexedDB.scan).not.toHaveBeenCalled()
  })

  it('falls back to a cursor scan for a compound prefix, never store.index(prefix)', async () => {
    await new QueryBuilder(FIXTURE, 'fromType', 'QualityEvent').exec()

    // The regression: this used to be getByIndex('recordLinks', 'fromType', …),
    // which throws NotFoundError because no such index exists.
    expect(IndexedDB.getByIndex).not.toHaveBeenCalled()
    expect(IndexedDB.getByIndexMulti).not.toHaveBeenCalled()
    expect(IndexedDB.scan).toHaveBeenCalledTimes(1)
  })

  it('the scan fallback still filters on the demoted field', async () => {
    await new QueryBuilder(FIXTURE, 'fromType', 'QualityEvent').exec()

    const predicate = IndexedDB.scan.mock.calls[0][1]
    expect(predicate({ fromType: 'QualityEvent' })).toBe(true)
    expect(predicate({ fromType: 'Complaint' })).toBe(false)
  })

  it('does not promote a compound prefix added via chained .where() either', async () => {
    await new QueryBuilder(FIXTURE).where('toType', 'Nonconformance').exec()

    expect(IndexedDB.getByIndex).not.toHaveBeenCalled()
    expect(IndexedDB.scan).toHaveBeenCalledTimes(1)
  })
})

describe('real model declarations', () => {
  function customIndexOf(name) {
    const source = readFileSync(path.join(MODELS_DIR, name), 'utf8')
    return source.match(/customIndex:\s*'([^']*)'/)?.[1] ?? ''
  }

  function modelFiles() {
    return readdirSync(MODELS_DIR)
      .filter(function isModel(name) {
        return name.endsWith('.js') && !name.endsWith('.spec.js')
      })
      .sort()
  }

  it('recordLink still declares fromType/toType only as compound prefixes', () => {
    const declared = parseCustomIndex(customIndexOf('recordLink.js'))
    const singles = declared.filter((i) => i.type === 'single').map((i) => i.field)

    expect(declared.some((i) => i.type === 'compound' && i.fields[0] === 'fromType')).toBe(true)
    expect(singles).not.toContain('fromType')
    expect(singles).not.toContain('toType')
  })

  it('the compound-prefix hazard exists across many models, not just recordLink', () => {
    // If this ever drops to zero the behaviour tests above are still correct
    // but no longer describe anything real — which is worth knowing.
    const affected = modelFiles().filter(function hasUnreachablePrefix(name) {
      const declared = parseCustomIndex(customIndexOf(name))
      const singles = new Set(declared.filter((i) => i.type === 'single').map((i) => i.field))
      return declared.some((i) => i.type === 'compound' && !singles.has(i.fields[0]))
    })

    expect(affected).toContain('recordLink.js')
    expect(affected.length).toBeGreaterThan(5)
  })

  it('the scan actually sees the model directory', () => {
    expect(modelFiles().length).toBeGreaterThan(50)
  })
})
