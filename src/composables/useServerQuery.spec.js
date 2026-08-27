import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope, ref, nextTick } from 'vue'

/**
 * useServerQuery is the ONE read path that leaves the SyncEngine, so it is the
 * one place in the app where a stale response can land on top of a fresh one and
 * where a cancelled request could be mistaken for a failure.
 *
 * The behaviours pinned here, in order of how badly they'd hurt:
 *  1. every run gets its OWN AbortController, and a superseded run is cancelled,
 *  2. a cancelled run is NEVER surfaced as an error and NEVER lands in `data` —
 *     detected via `signal.aborted`, not by sniffing the message, because
 *     graphqlClient wraps a network/abort failure in a GraphQLError whose
 *     message says nothing about aborting,
 *  3. the `enabled` gate: no fetch before entitlement resolves, and a gated
 *     handle does not sit in `loading` forever.
 */

// Stub the GraphQL client — no real network, and we control when each request
// settles so an in-flight run can be superseded deterministically.
const graphqlRequest = vi.fn()
class FakeGraphQLError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GraphQLError'
  }
}
vi.mock('@syncEngine/network/graphqlClient.js', () => ({
  graphqlRequest: (...args) => graphqlRequest(...args),
  GraphQLError: FakeGraphQLError,
}))

const { useServerQuery, useServerQueryWithDeps, useGraphQLQuery } =
  await import('./useServerQuery.js')

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

/** Let watchers flush and any settled promise chain drain. */
async function settle() {
  await nextTick()
  await tick(0)
  await nextTick()
}

/** Run the composable inside an effect scope so onScopeDispose fires. */
function inScope(fn) {
  const scope = effectScope()
  let out
  scope.run(() => (out = fn()))
  return { q: out, stop: () => scope.stop() }
}

/** A queryFn whose runs are settled by the test, one deferred per invocation. */
function deferredQuery() {
  const runs = []
  const fn = vi.fn((signal, deps) => {
    let resolve, reject
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    runs.push({ signal, deps, resolve, reject })
    return promise
  })
  return { fn, runs }
}

let consoleError
beforeEach(() => {
  graphqlRequest.mockReset()
  // run() logs real failures; keep the test output readable but assertable.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => consoleError.mockRestore())

/* ------------------------------------------------ AbortController per run */

describe('useServerQuery — one AbortController per run', () => {
  it('hands the query fn a real AbortSignal', async () => {
    const seen = []
    const { q, stop } = inScope(() =>
      useServerQuery(async (signal) => {
        seen.push(signal)
        return 'ok'
      }),
    )
    await settle()

    expect(seen).toHaveLength(1)
    expect(seen[0]).toBeInstanceOf(AbortSignal)
    expect(seen[0].aborted).toBe(false)
    expect(q.data.value).toBe('ok')
    stop()
  })

  it('gives every run a DIFFERENT controller — never reuses one', async () => {
    const key = ref('a')
    const seen = []
    const { stop } = inScope(() =>
      useServerQueryWithDeps([() => key.value], async (signal) => {
        seen.push(signal)
        return 1
      }),
    )
    await settle()

    key.value = 'b'
    await settle()
    key.value = 'c'
    await settle()

    expect(seen).toHaveLength(3)
    expect(new Set(seen).size).toBe(3)
    stop()
  })

  it('ABORTS the superseded run when the deps change under it', async () => {
    const key = ref('a')
    const { fn, runs } = deferredQuery()
    const { stop } = inScope(() => useServerQueryWithDeps([() => key.value], fn))
    await settle()
    expect(runs).toHaveLength(1)
    expect(runs[0].signal.aborted).toBe(false)

    key.value = 'b'
    await settle()

    expect(runs).toHaveLength(2)
    expect(runs[0].signal.aborted).toBe(true) // the question it answered is stale
    expect(runs[1].signal.aborted).toBe(false)
    stop()
  })

  it('passes the resolved dep values alongside the signal, mirroring useLiveQueryWithDeps', async () => {
    const key = ref('a')
    const { fn, runs } = deferredQuery()
    const { stop } = inScope(() => useServerQueryWithDeps([() => key.value], fn))
    await settle()
    expect(runs[0].deps).toEqual(['a'])

    key.value = 'b'
    await settle()
    expect(runs[1].deps).toEqual(['b'])
    stop()
  })

  it('abort() cancels the in-flight run on demand and stops it spinning', async () => {
    const { fn, runs } = deferredQuery()
    const { q, stop } = inScope(() => useServerQuery(fn))
    await settle()
    expect(q.loading.value).toBe(true)

    q.abort()
    expect(runs[0].signal.aborted).toBe(true)

    runs[0].resolve('too late')
    await settle()
    expect(q.data.value).toBeUndefined()
    expect(q.error.value).toBeNull()
    expect(q.loading.value).toBe(false)
    stop()
  })

  it('aborts anything in flight when the owning scope is disposed', async () => {
    const { fn, runs } = deferredQuery()
    const { q, stop } = inScope(() => useServerQuery(fn))
    await settle()

    stop()
    expect(runs[0].signal.aborted).toBe(true)

    runs[0].resolve('after unmount')
    await settle()
    expect(q.data.value).toBeUndefined()

    // and a late refresh() on a dead handle never fires another request
    await q.refresh()
    await settle()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

/* ------------------------------------- an aborted run is not a failed run */

describe('useServerQuery — a cancelled run is not an error', () => {
  it('a superseded run that REJECTS never reaches `error`', async () => {
    const key = ref('a')
    const { fn, runs } = deferredQuery()
    const { q, stop } = inScope(() => useServerQueryWithDeps([() => key.value], fn))
    await settle()

    key.value = 'b'
    await settle()

    // graphqlClient wraps the abort in a GraphQLError whose message gives no
    // hint that it was a cancellation — this is exactly why the composable must
    // consult signal.aborted rather than sniff the message.
    runs[0].reject(new FakeGraphQLError('Network error'))
    await settle()

    expect(q.error.value).toBeNull()
    expect(consoleError).not.toHaveBeenCalled()

    runs[1].resolve('fresh')
    await settle()
    expect(q.data.value).toBe('fresh')
    stop()
  })

  it('a superseded run that RESOLVES LATE never overwrites the fresh answer', async () => {
    const key = ref('a')
    const { fn, runs } = deferredQuery()
    const { q, stop } = inScope(() => useServerQueryWithDeps([() => key.value], fn))
    await settle()

    key.value = 'b'
    await settle()

    runs[1].resolve('B') // newer request lands first
    await settle()
    expect(q.data.value).toBe('B')

    runs[0].resolve('A') // stale request lands second — must be ignored
    await settle()
    expect(q.data.value).toBe('B')
    stop()
  })

  it('a manually aborted run that rejects is silent too', async () => {
    const { fn, runs } = deferredQuery()
    const { q, stop } = inScope(() => useServerQuery(fn))
    await settle()

    q.abort('user navigated away')
    runs[0].reject(new FakeGraphQLError('Failed to fetch'))
    await settle()

    expect(q.error.value).toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
    stop()
  })

  it('a GENUINE failure IS surfaced — the silence is only for cancellations', async () => {
    const boom = new FakeGraphQLError('permission denied for function metric_value')
    const { q, stop } = inScope(() =>
      useServerQuery(async () => {
        throw boom
      }),
    )
    await settle()

    expect(q.error.value).toBe(boom)
    expect(q.loading.value).toBe(false)
    expect(q.loaded.value).toBe(false)
    expect(consoleError).toHaveBeenCalledWith(boom)
    stop()
  })
})

/* ----------------------------------------------------------- enabled gate */

describe('useServerQuery — the `enabled` entitlement gate', () => {
  it('does NOT fetch while the gate is closed, and does not sit in loading', async () => {
    const entitled = ref(false)
    const fn = vi.fn(async () => 'metrics')
    const { q, stop } = inScope(() => useServerQuery(fn, { enabled: entitled }))
    await settle()

    expect(fn).not.toHaveBeenCalled()
    expect(q.loading.value).toBe(false) // a gated tile must not spin forever
    expect(q.loaded.value).toBe(false)
    expect(q.error.value).toBeNull()
    stop()
  })

  it('fires exactly once when entitlement resolves to true', async () => {
    const entitled = ref(false)
    const fn = vi.fn(async () => 'metrics')
    const { q, stop } = inScope(() => useServerQuery(fn, { enabled: entitled }))
    await settle()
    expect(fn).not.toHaveBeenCalled()

    entitled.value = true
    await settle()

    expect(fn).toHaveBeenCalledTimes(1)
    expect(q.data.value).toBe('metrics')
    expect(q.loaded.value).toBe(true)
    stop()
  })

  it('accepts a getter gate (e.g. () => Boolean(metricKey))', async () => {
    const metricKey = ref(null)
    const fn = vi.fn(async () => 1)
    const { stop } = inScope(() => useServerQuery(fn, { enabled: () => Boolean(metricKey.value) }))
    await settle()
    expect(fn).not.toHaveBeenCalled()

    metricKey.value = 'capa.raised'
    await settle()
    expect(fn).toHaveBeenCalledTimes(1)
    stop()
  })

  it('a hard-false gate never fires, not even on a dep change', async () => {
    const key = ref('a')
    const fn = vi.fn(async () => 1)
    const { q, stop } = inScope(() =>
      useServerQueryWithDeps([() => key.value], fn, { enabled: false }),
    )
    await settle()

    key.value = 'b'
    await settle()

    expect(fn).not.toHaveBeenCalled()
    expect(q.loading.value).toBe(false)
    stop()
  })

  it('closing the gate cancels the in-flight run rather than letting it land', async () => {
    const entitled = ref(true)
    const key = ref('a')
    const { fn, runs } = deferredQuery()
    const { q, stop } = inScope(() =>
      useServerQueryWithDeps([() => key.value], fn, { enabled: entitled }),
    )
    await settle()
    expect(runs).toHaveLength(1)

    entitled.value = false
    key.value = 'b' // a dep change while gated re-enters run() and shuts it down
    await settle()

    expect(runs).toHaveLength(1)
    expect(runs[0].signal.aborted).toBe(true)
    expect(q.loading.value).toBe(false)

    runs[0].resolve('should not land')
    await settle()
    expect(q.data.value).toBeUndefined()
    stop()
  })

  it('the default gate is open', async () => {
    const fn = vi.fn(async () => 1)
    const { stop } = inScope(() => useServerQuery(fn))
    await settle()
    expect(fn).toHaveBeenCalledTimes(1)
    stop()
  })
})

/* --------------------------------------------------------- state machine */

describe('useServerQuery — loading / loaded / error state machine', () => {
  it('seeds `data` with `initial` before the first response', async () => {
    const { fn } = deferredQuery()
    const { q, stop } = inScope(() => useServerQuery(fn, { initial: null }))
    expect(q.data.value).toBeNull()
    expect(q.loaded.value).toBe(false)
    stop()
  })

  it('is loading synchronously from creation until the response lands', async () => {
    const { fn, runs } = deferredQuery()
    const { q, stop } = inScope(() => useServerQuery(fn))
    expect(q.loading.value).toBe(true)

    runs[0].resolve('done')
    await settle()

    expect(q.loading.value).toBe(false)
    expect(q.loaded.value).toBe(true)
    expect(q.data.value).toBe('done')
    expect(q.error.value).toBeNull()
    stop()
  })

  it('a failure sets `error`, clears `loading`, and leaves `loaded` false', async () => {
    const { fn, runs } = deferredQuery()
    const { q, stop } = inScope(() => useServerQuery(fn, { initial: null }))
    runs[0].reject(new FakeGraphQLError('boom'))
    await settle()

    expect(q.error.value).toBeInstanceOf(Error)
    expect(q.loading.value).toBe(false)
    expect(q.loaded.value).toBe(false)
    expect(q.data.value).toBeNull() // the stale/initial value is not clobbered
    stop()
  })

  it('clears a previous error as soon as a new run starts', async () => {
    const { fn, runs } = deferredQuery()
    const { q, stop } = inScope(() => useServerQuery(fn))
    runs[0].reject(new FakeGraphQLError('boom'))
    await settle()
    expect(q.error.value).not.toBeNull()

    q.refresh()
    await nextTick()
    expect(q.error.value).toBeNull()
    expect(q.loading.value).toBe(true)

    runs[1].resolve('recovered')
    await settle()
    expect(q.data.value).toBe('recovered')
    expect(q.loaded.value).toBe(true)
    stop()
  })

  it('`loaded` stays true after a later failure — the last good value is still shown', async () => {
    const { fn, runs } = deferredQuery()
    const { q, stop } = inScope(() => useServerQuery(fn))
    runs[0].resolve('v1')
    await settle()
    expect(q.loaded.value).toBe(true)

    q.refresh()
    await nextTick()
    runs[1].reject(new FakeGraphQLError('boom'))
    await settle()

    expect(q.loaded.value).toBe(true)
    expect(q.data.value).toBe('v1')
    expect(q.error.value).not.toBeNull()
    stop()
  })
})

/* ------------------------------------------------------------ retry / refresh */

describe('useServerQuery — retry()', () => {
  it('re-runs the query and counts the attempt', async () => {
    const { fn, runs } = deferredQuery()
    const { q, stop } = inScope(() => useServerQuery(fn))
    runs[0].reject(new FakeGraphQLError('boom'))
    await settle()
    expect(q.retryCount.value).toBe(0)

    q.retry()
    await nextTick()
    expect(q.retryCount.value).toBe(1)
    expect(fn).toHaveBeenCalledTimes(2)

    runs[1].resolve('ok')
    await settle()
    expect(q.error.value).toBeNull()
    expect(q.data.value).toBe('ok')

    q.retry()
    await nextTick()
    expect(q.retryCount.value).toBe(2)
    stop()
  })

  it('refresh() re-runs WITHOUT counting a retry, reusing the last dep values', async () => {
    const key = ref('a')
    const { fn, runs } = deferredQuery()
    const { q, stop } = inScope(() => useServerQueryWithDeps([() => key.value], fn))
    await settle()

    q.refresh() // not awaited: refresh() resolves only when the run settles
    await settle()

    expect(q.retryCount.value).toBe(0)
    expect(runs).toHaveLength(2)
    expect(runs[1].deps).toEqual(['a'])
    expect(runs[0].signal.aborted).toBe(true) // the refresh supersedes it
    stop()
  })
})

/* ------------------------------------------------------------------ debounce */

describe('useServerQueryWithDeps — debounce', () => {
  it('coalesces a burst of dep changes into a single request', async () => {
    const key = ref('a')
    const fn = vi.fn(async () => 1)
    const { stop } = inScope(() => useServerQueryWithDeps([() => key.value], fn, { debounce: 20 }))

    key.value = 'b'
    await nextTick()
    key.value = 'c'
    await nextTick()
    expect(fn).not.toHaveBeenCalled()

    await tick(40)
    expect(fn).toHaveBeenCalledTimes(1)
    stop()
  })
})

/* -------------------------------------------------------------- useGraphQLQuery */

describe('useGraphQLQuery — the flavour analytics actually uses', () => {
  const QUERY = 'query MetricValue($pMetricKey: String) { metricValue { nodes { value } } }'

  it('calls the shared client with the query, the variables and the run signal', async () => {
    graphqlRequest.mockResolvedValue({ metricValue: { nodes: [{ value: '90.1' }] } })
    const { q, stop } = inScope(() =>
      useGraphQLQuery(QUERY, { pMetricKey: 'capa.raised' }, { initial: null }),
    )
    await settle()

    expect(graphqlRequest).toHaveBeenCalledTimes(1)
    const [query, vars, opts] = graphqlRequest.mock.calls[0]
    expect(query).toBe(QUERY)
    expect(vars).toEqual({ pMetricKey: 'capa.raised' })
    expect(opts.signal).toBeInstanceOf(AbortSignal)
    expect(q.data.value).toEqual({ metricValue: { nodes: [{ value: '90.1' }] } })
    stop()
  })

  it('re-queries when reactive variables change, and aborts the superseded request', async () => {
    const aborted = []
    graphqlRequest.mockImplementation(
      (query, vars, { signal }) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => aborted.push(vars.pMetricKey))
          setTimeout(() => resolve({ echo: vars.pMetricKey }), 5)
        }),
    )
    const metricKey = ref('capa.raised')
    const { q, stop } = inScope(() =>
      useGraphQLQuery(QUERY, () => ({ pMetricKey: metricKey.value }), { initial: null }),
    )
    await nextTick()

    metricKey.value = 'ncr.open'
    await settle()
    await tick(20)

    expect(aborted).toEqual(['capa.raised'])
    expect(graphqlRequest.mock.calls.map((c) => c[1].pMetricKey)).toEqual([
      'capa.raised',
      'ncr.open',
    ])
    expect(q.data.value).toEqual({ echo: 'ncr.open' })
    expect(q.error.value).toBeNull()
    stop()
  })

  it('a client rejection caused by the abort is swallowed, not shown to the user', async () => {
    // graphqlClient turns any fetch throw — including an AbortError — into a
    // GraphQLError. The message is useless for detection; signal.aborted is not.
    graphqlRequest.mockImplementation(
      (query, vars, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () =>
            reject(new FakeGraphQLError('The user aborted a request.')),
          )
          setTimeout(() => resolve({ echo: vars.pMetricKey }), 5)
        }),
    )
    const metricKey = ref('capa.raised')
    const { q, stop } = inScope(() =>
      useGraphQLQuery(QUERY, () => ({ pMetricKey: metricKey.value }), { initial: null }),
    )
    await nextTick()

    metricKey.value = 'ncr.open'
    await settle()
    await tick(20)

    expect(q.error.value).toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
    expect(q.data.value).toEqual({ echo: 'ncr.open' })
    stop()
  })

  it('a real GraphQL error surfaces with retry available', async () => {
    const denied = new FakeGraphQLError('permission denied for function metric_value')
    graphqlRequest.mockRejectedValueOnce(denied)
    graphqlRequest.mockResolvedValueOnce({ metricValue: { nodes: [] } })

    const { q, stop } = inScope(() => useGraphQLQuery(QUERY, {}, { initial: null }))
    await settle()
    expect(q.error.value).toBe(denied)

    await q.retry()
    await settle()
    expect(q.error.value).toBeNull()
    expect(q.retryCount.value).toBe(1)
    expect(q.data.value).toEqual({ metricValue: { nodes: [] } })
    stop()
  })

  it('respects the enabled gate — nothing hits the network before entitlement resolves', async () => {
    graphqlRequest.mockResolvedValue({ ok: true })
    const entitled = ref(false)
    const { stop } = inScope(() => useGraphQLQuery(QUERY, {}, { initial: null, enabled: entitled }))
    await settle()
    expect(graphqlRequest).not.toHaveBeenCalled()

    entitled.value = true
    await settle()
    expect(graphqlRequest).toHaveBeenCalledTimes(1)
    stop()
  })
})
