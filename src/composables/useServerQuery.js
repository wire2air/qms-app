import { shallowRef, ref, watch, toValue, onScopeDispose } from 'vue'
import { graphqlRequest } from '@syncEngine/network/graphqlClient.js'

/**
 * useServerQuery — the SyncEngine EXCEPTION path (see CLAUDE.md rule #4).
 *
 * Everything a component reads normally comes out of IndexedDB through
 * `useLiveQuery` / `useLiveQueryWithDeps`. Server-computed aggregates cannot:
 * they are not records, they are not per-tenant-cacheable (the same metric
 * legitimately returns a different number per viewer, because the server
 * applies the caller's access scope), and caching one per-record in IDB would
 * both leak a scope boundary across users on a shared device and go stale with
 * no invalidation signal. So analytics reads go straight to GraphQL and are
 * never persisted.
 *
 * Ergonomics deliberately mirror `useLiveQuery`:
 *   - the query fn takes a CONTEXT first (there: `db`; here: an `AbortSignal`)
 *     and the resolved dep values second,
 *   - `initial` seeds the value before the first response,
 *   - the deps variant re-runs on reactive change.
 *
 * What it adds, because the network can fail and IDB cannot:
 *   - real `loading` (not "value is still undefined"),
 *   - a captured `error` plus `retry()`,
 *   - an `AbortSignal` per run, so a superseded request is CANCELLED rather
 *     than left to land out of order over a newer one.
 */

const DEFAULT_DEBOUNCE = 0

/**
 * @typedef {object} ServerQueryHandle
 * @property {import('vue').ShallowRef<any>} data      latest successful result
 * @property {import('vue').ShallowRef<Error|null>} error last failure (cleared on a new run)
 * @property {import('vue').Ref<boolean>} loading       a request is in flight
 * @property {import('vue').Ref<boolean>} loaded        at least one run has succeeded
 * @property {import('vue').Ref<number>} retryCount     how many times retry() ran
 * @property {() => Promise<void>} refresh              re-run with the current deps
 * @property {() => Promise<void>} retry                refresh + bump retryCount
 * @property {(reason?: any) => void} abort             cancel the in-flight request
 */

/**
 * Shared core. `deps` may be null for the no-deps variant.
 *
 * @param {import('vue').WatchSource|import('vue').WatchSource[]|null} deps
 * @param {(signal: AbortSignal, deps: any[]) => Promise<any>} queryFn
 * @param {object} [options]
 * @param {any}     [options.initial]   value before the first successful run
 * @param {number}  [options.debounce]  ms to coalesce rapid dep changes
 * @param {boolean|(() => boolean)} [options.enabled] gate — when falsy the query never fires
 * @returns {ServerQueryHandle}
 */
function createServerQuery(deps, queryFn, options = {}) {
  const { initial = undefined, debounce = DEFAULT_DEBOUNCE, enabled = true } = options

  const data = shallowRef(initial)
  const error = shallowRef(null)
  const loading = ref(false)
  const loaded = ref(false)
  const retryCount = ref(0)

  /** @type {AbortController|null} */
  let controller = null
  let runId = 0
  let timer = null
  let lastDepValues = []
  let disposed = false

  function abort(reason = 'superseded') {
    if (!controller) return
    controller.abort(reason)
    controller = null
  }

  async function run(depValues) {
    if (depValues !== undefined) lastDepValues = depValues
    if (disposed) return
    if (!toValue(enabled)) {
      // Gated off (e.g. the tenant is not entitled, or the metric key is not
      // chosen yet). Drop anything in flight and stop — leaving `loading` true
      // here is what makes a gated tile spin forever.
      abort('disabled')
      loading.value = false
      return
    }

    // Supersede: the previous request can no longer be the answer to the
    // question now being asked, so cancel it instead of racing it.
    abort()
    const id = ++runId
    const ac = new AbortController()
    controller = ac
    loading.value = true
    error.value = null

    try {
      const result = await queryFn(ac.signal, lastDepValues)
      if (ac.signal.aborted || id !== runId) return
      data.value = result
      loaded.value = true
    } catch (err) {
      // An aborted run is not a failure — it is a run whose answer stopped
      // being wanted. Never surface it as an error state.
      if (ac.signal.aborted || id !== runId) return
      error.value = err
      console.error(err)
    } finally {
      if (id === runId) {
        loading.value = false
        controller = null
      }
    }
  }

  function schedule(depValues) {
    if (!debounce) {
      run(depValues)
      return
    }
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      run(depValues)
    }, debounce)
  }

  async function refresh() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    await run()
  }

  async function retry() {
    retryCount.value += 1
    await refresh()
  }

  if (deps) {
    watch(
      deps,
      (newValues) => {
        lastDepValues = newValues
        schedule(newValues)
      },
      { immediate: true },
    )
  } else {
    run([])
  }

  // Re-run when an `enabled` gate opens (entitlement resolves, a key arrives).
  if (typeof enabled === 'function' || (enabled && typeof enabled === 'object')) {
    watch(
      () => toValue(enabled),
      (isOn, wasOn) => {
        if (isOn && !wasOn) schedule(lastDepValues)
      },
    )
  }

  onScopeDispose(() => {
    disposed = true
    if (timer) clearTimeout(timer)
    abort('unmounted')
  })

  return { data, error, loading, loaded, retryCount, refresh, retry, abort }
}

/**
 * Run a server request once on setup (plus whenever `refresh()`/`retry()` is
 * called). Mirrors `useLiveQuery`'s shape, but returns a handle rather than a
 * bare ref because network reads have failure and retry states IDB reads do not.
 *
 * @param {(signal: AbortSignal) => Promise<any>} queryFn
 * @param {object} [options] — see createServerQuery
 * @returns {ServerQueryHandle}
 */
export function useServerQuery(queryFn, options = {}) {
  return createServerQuery(null, (signal) => queryFn(signal), options)
}

/**
 * Re-run whenever the reactive deps change, cancelling the superseded request.
 * Mirrors `useLiveQueryWithDeps`: `(context, depValues) => Promise<result>`.
 *
 * @param {import('vue').WatchSource|import('vue').WatchSource[]} deps
 * @param {(signal: AbortSignal, deps: any[]) => Promise<any>} queryFn
 * @param {object} [options] — see createServerQuery
 * @returns {ServerQueryHandle}
 */
export function useServerQueryWithDeps(deps, queryFn, options = {}) {
  return createServerQuery(deps, queryFn, options)
}

/**
 * The GraphQL flavour — the one analytics actually uses. Reuses the app's
 * existing client (`syncEngine/network/graphqlClient.js`, same `/api/graphql`
 * endpoint, same session cookie, same `GraphQLError`), and threads the
 * per-run `AbortSignal` into it.
 *
 *   const { data, loading, error, retry } = useGraphQLQuery(
 *     METRIC_VALUE_QUERY,
 *     () => ({ metricKey: props.metricKey, periodStart, periodEnd }),
 *   )
 *
 * @param {string} query                       GraphQL document
 * @param {object|(() => object)} [variables]  variables, or a getter for reactive ones
 * @param {object} [options]                   see createServerQuery
 * @returns {ServerQueryHandle}
 */
export function useGraphQLQuery(query, variables = {}, options = {}) {
  return createServerQuery(
    () => toValue(variables),
    (signal, vars) => graphqlRequest(query, vars, { signal }),
    options,
  )
}
