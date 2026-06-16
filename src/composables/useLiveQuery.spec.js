import { describe, it, expect, vi, beforeEach } from 'vitest'
import { effectScope } from 'vue'

// Avoid loading the full model layer — useLiveQuery only hands `db` to the
// query fn, which our test fns ignore.
vi.mock('@models/index', () => ({ db: {} }))

const { syncBus } = await import('@syncEngine/core/syncBus.js')
const { useLiveQuery, useLiveQueryWithDeps } = await import('./useLiveQuery.js')

const tick = (ms) => new Promise((r) => setTimeout(r, ms))
const emit = (modelName) =>
  syncBus.emit({ modelName, modelId: 'id', action: 'update', type: 'sync' })

// Run the composable inside an effect scope so onScopeDispose works, and so we
// can tear listeners down between tests.
function inScope(fn) {
  const scope = effectScope()
  let out
  scope.run(() => (out = fn()))
  return { out, stop: () => scope.stop() }
}

describe('useLiveQuery — model scoping (the sync-safety guarantee)', () => {
  it("a query scoped to ['Document'] re-runs on Document, NOT on an unrelated model", async () => {
    const queryFn = vi.fn(async () => 1)
    const { stop } = inScope(() => useLiveQuery(queryFn, { models: ['Document'], debounce: 0 }))
    await tick(0)
    const afterLoad = queryFn.mock.calls.length // initial load ran once

    emit('NcRecord') // unrelated → must NOT re-run
    await tick(5)
    expect(queryFn.mock.calls.length).toBe(afterLoad)

    emit('Document') // scoped model → must re-run
    await tick(5)
    expect(queryFn.mock.calls.length).toBe(afterLoad + 1)

    stop()
  })

  it('a multi-model scope re-runs on ANY of its models', async () => {
    const queryFn = vi.fn(async () => 1)
    const { stop } = inScope(() =>
      useLiveQuery(queryFn, { models: ['NcRecord', 'TaskInstance'], debounce: 0 }),
    )
    await tick(0)
    const base = queryFn.mock.calls.length

    emit('TaskInstance')
    await tick(5)
    emit('NcRecord')
    await tick(5)
    expect(queryFn.mock.calls.length).toBe(base + 2)

    emit('Document') // not in scope
    await tick(5)
    expect(queryFn.mock.calls.length).toBe(base + 2)

    stop()
  })

  it("wildcard '*' still re-runs on every model (proves old behavior preserved where kept)", async () => {
    const queryFn = vi.fn(async () => 1)
    const { stop } = inScope(() => useLiveQuery(queryFn, { models: '*', debounce: 0 }))
    await tick(0)
    const base = queryFn.mock.calls.length

    emit('Whatever')
    await tick(5)
    expect(queryFn.mock.calls.length).toBe(base + 1)

    stop()
  })

  it('useLiveQueryWithDeps is scoped the same way', async () => {
    const queryFn = vi.fn(async () => 1)
    const { stop } = inScope(() =>
      useLiveQueryWithDeps([() => 'x'], queryFn, { models: ['Supplier'], debounce: 0 }),
    )
    await tick(0)
    const base = queryFn.mock.calls.length

    emit('Document') // unrelated
    await tick(5)
    expect(queryFn.mock.calls.length).toBe(base)

    emit('Supplier') // scoped
    await tick(5)
    expect(queryFn.mock.calls.length).toBe(base + 1)

    stop()
  })
})
