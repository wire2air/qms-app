import { shallowRef, watch, onScopeDispose } from 'vue'
import { syncBus } from '@syncEngine/core/syncBus.js'
import { db } from '@models/index'
import { ValidationError } from '@syncEngine/index'

const DEFAULT_DEBOUNCE = 50

/**
 * Resolve a component-facing model name (e.g. 'Site') to the syncBus channel the
 * engine actually emits on. The engine keys sync events by the model's RUNTIME
 * class name — `instance.constructor.name` in directSaveStrategy and the
 * equivalent `meta.modelName` in socketSubscriber (both provably the same string,
 * since every save does `getSchema(instance.constructor.name)` and succeeds).
 * A production build minifies class names (`class Site` → e.g. 'Xe'), but `db`
 * is keyed by the un-minified property name, and `db[name]` is that same class,
 * so `db[name].name` yields the exact runtime identifier the emit side uses —
 * matching in dev (unminified) and prod (minified) alike.
 *
 * Without this, minified builds silently never re-run any live query: components
 * subscribe to the literal 'Site' while every event fires under 'Xe'. That's why
 * live updates work on the dev server but not on the deployed (minified) build.
 *
 * '*' (wildcard) and any unknown name pass through unchanged.
 */
function resolveSyncChannel(name) {
  if (name === '*') return '*'
  return db[name]?.name ?? name
}

/**
 * useLiveQuery — run an async query and re-execute on sync events.
 *
 * Returns a shallowRef so BaseModel instances are never wrapped in a Proxy
 * (avoids private-field access errors).
 *
 * @template T
 * @param {(db: typeof import('@models/index').db) => Promise<T>} queryFn — async function returning results
 * @param {object}  [options]
 * @param {string|string[]} [options.models='*']  — model(s) to watch
 * @param {any}             [options.initial=undefined]  — value before first load
 * @param {number}          [options.debounce=50] — ms to coalesce burst syncs
 * @returns {import('vue').ShallowRef<T>}
 */
export function useLiveQuery(
  queryFn,
  { models = '*', initial = undefined, debounce = DEFAULT_DEBOUNCE } = {},
) {
  const data = shallowRef(initial)
  let requestId = 0
  let disposed = false

  async function refresh() {
    const myRequestId = ++requestId
    try {
      const result = await queryFn(db)
      // Drop stale results — a later refresh may already have resolved
      // (e.g. a burst of sync events) and we must not clobber it. Also drop
      // anything resolving after the owning scope was disposed — a debounced
      // syncBus callback scheduled just before unmount can still fire after
      // (belt-and-braces alongside syncBus's own timer cancellation).
      if (myRequestId !== requestId || disposed) return
      data.value = result
    } catch (err) {
      console.error(err)
    }
  }

  // Initial load
  refresh()

  // Subscribe to sync events (model-scoped, debounced)
  const modelList = (Array.isArray(models) ? models : [models]).map(resolveSyncChannel)
  const unsubscribes = modelList.map((m) => syncBus.on(m, refresh, { debounce }))

  onScopeDispose(() => {
    disposed = true
    unsubscribes.forEach((fn) => fn())
  })

  return data
}

/**
 * useLiveQueryWithDeps — like useLiveQuery but also re-runs when reactive deps change.
 *
 * Uses Vue `watch` for dependency tracking so the query re-runs on both
 * reactive state changes AND sync events.
 *
 * @template T
 * @param {import('vue').WatchSource|import('vue').WatchSource[]} deps — reactive dependencies
 * @param {(db: typeof import('@models/index').db, ...args: any[]) => Promise<T>} queryFn
 * @param {object} [options] — same as useLiveQuery
 * @returns {import('vue').ShallowRef<T>}
 */
export function useLiveQueryWithDeps(
  deps,
  queryFn,
  { models = '*', initial = undefined, debounce = DEFAULT_DEBOUNCE } = {},
) {
  const data = shallowRef(initial)
  let lastDepValues = []
  let requestId = 0
  let disposed = false

  async function refresh(depValues) {
    const myRequestId = ++requestId
    try {
      const result = await queryFn(db, depValues)
      // Drop stale results: a deps change and a sync event can both trigger
      // a refresh for the same model concurrently (e.g. deleting the
      // selected record — the parent reselects a new id while this query's
      // own sync-triggered refresh is still resolving against the old,
      // now-deleted id). Only the most recently *started* refresh may write.
      // Also drop anything resolving after the owning scope was disposed — a
      // debounced syncBus callback scheduled just before unmount (e.g. a
      // route navigation right after a mutation) can still fire after
      // (belt-and-braces alongside syncBus's own timer cancellation), and
      // writing a fresh value here can newly mount a v-if'd subtree against
      // a component tree vue-router has already torn down.
      if (myRequestId !== requestId || disposed) return
      data.value = result
    } catch (err) {
      console.error(err)
    }
  }

  // Re-run when deps change (immediate: true handles the initial load)
  watch(
    deps,
    (newValues) => {
      lastDepValues = newValues
      refresh(newValues)
    },
    { immediate: true },
  )

  // Re-run on sync events — reuse the last resolved dep values
  const modelList = (Array.isArray(models) ? models : [models]).map(resolveSyncChannel)
  const unsubscribes = modelList.map((m) =>
    syncBus.on(m, () => refresh(lastDepValues), { debounce }),
  )

  onScopeDispose(() => {
    disposed = true
    unsubscribes.forEach((fn) => fn())
  })

  return data
}

/**
 * @template T
 * @param {(db: typeof import('@models/index').db, ...args: any[]) => Promise<T>} mutationFn
 * @returns {(args: any[]) => Promise<T>} mutate function that runs the mutation and logs errors
 */
export function useLiveMutation(mutationFn) {
  const toast = useToast()
  async function mutate(...args) {
    try {
      return await mutationFn(db, ...args)
    } catch (err) {
      if (err instanceof ValidationError) {
        // Handle validation errors gracefully (e.g. show toast) instead of logging as an error
        toast.notify({
          message: 'Validation error: ' + err.errors.map((e) => e.message).join(', '),
          type: 'error',
        })
        return
      }
      // Every other failure (GraphQL/DB errors, unique-constraint violations,
      // network) must reach the user — a pessimistic save that throws changed
      // nothing, so silently console.error'ing it left the UI with no feedback
      // at all (e.g. duplicate site/department create appeared to do nothing).
      console.error(err)
      toast.notify({ message: friendlyMutationError(err), type: 'error' })
      return
    }
  }

  return mutate
}

/**
 * Turn a raw mutation error into a user-facing message. PostGraphile masks
 * server-side errors in production to "An error occurred (logged with hash: …)";
 * surface something human instead of that opaque string.
 */
function friendlyMutationError(err) {
  const msg = err?.message || ''
  if (!msg || /logged with hash/i.test(msg) || /^an error occurred/i.test(msg)) {
    return 'Something went wrong. Please try again.'
  }
  if (/duplicate key|unique constraint|already exists/i.test(msg)) {
    return 'That already exists. Please use a different value.'
  }
  return msg
}
