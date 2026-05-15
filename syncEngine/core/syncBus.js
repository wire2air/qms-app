/**
 * syncBus — lightweight event emitter for sync notifications.
 *
 * directSaveStrategy and socketSubscriber fire events here after writing
 * to IndexedDB.  useLiveQuery subscribes to re-execute queries.
 *
 * Supports optional per-listener debounce so burst syncs (e.g. 50 rows)
 * coalesce into a single callback.
 */

const listeners = new Map() // modelName → Set<{ handler, raw }>
const wildcardListeners = new Set() // { handler, raw }

/**
 * Wrap a function with a trailing-edge debounce.
 * @param {Function} fn
 * @param {number} ms
 * @returns {Function}
 */
function debounce(fn, ms) {
  let timer
  return (event) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(event), ms)
  }
}

export const syncBus = {
  /**
   * Subscribe to sync events.
   * @param {string} modelName — model to watch, or '*' for all
   * @param {Function} fn — called with { modelName, modelId, action, type }
   * @param {{ debounce?: number }} [options]
   * @returns {Function} unsubscribe
   */
  on(modelName, fn, { debounce: ms = 0 } = {}) {
    const handler = ms > 0 ? debounce(fn, ms) : fn
    const entry = { handler, raw: fn }

    if (modelName === '*') {
      wildcardListeners.add(entry)
      return () => wildcardListeners.delete(entry)
    }

    if (!listeners.has(modelName)) listeners.set(modelName, new Set())
    listeners.get(modelName).add(entry)
    return () => listeners.get(modelName)?.delete(entry)
  },

  /**
   * Emit a sync event. Called by directSaveStrategy and socketSubscriber.
   * @param {{ modelName: string, modelId: string, action: string, type: string }} event
   */
  emit(event) {
    listeners.get(event.modelName)?.forEach((e) => e.handler(event))
    wildcardListeners.forEach((e) => e.handler(event))
  },
}
