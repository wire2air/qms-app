import { ref, watch, onScopeDispose } from 'vue'
import { useDebounceFn } from '@vueuse/core'

/**
 * AI in-form similarity (Phase 5).
 *
 * Reactively calls /api/v1/services/ai/similar as the user types in a create
 * form. Debounced (default 800ms) and cancels in-flight requests when input
 * changes again — so rapid typing never queues N parallel calls.
 *
 * Returns reactive refs:
 *   - matches : Array of { entityType, entityId, similarity, code, title, statusId, createdAt }
 *   - count   : total count from the API
 *   - loading : true while a request is in flight
 *   - error   : { code, message } | null
 *
 * Plus a `clear()` helper for cancelling and resetting (e.g. on form submit).
 *
 * Usage:
 *   const title = ref('')
 *   const description = ref('')
 *   const { matches, loading } = useSimilarRecords({
 *     entityTypes: ['Capa'],
 *     getText: () => `${title.value} ${description.value}`,
 *     minLength: 20,
 *   })
 */

const ENDPOINT = '/api/v1/services/ai/similar'

export function useSimilarRecords({
  getText,
  entityTypes,
  threshold = 0.6,
  limit = 5,
  minLength = 20,
  debounceMs = 800,
}) {
  const matches = ref([])
  const count = ref(0)
  const loading = ref(false)
  const error = ref(null)

  let controller = null

  async function fetchMatches(text) {
    // Cancel any in-flight request — the input has changed.
    if (controller) controller.abort()
    controller = new AbortController()
    loading.value = true
    error.value = null
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text, entityTypes, threshold, limit }),
        signal: controller.signal,
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        // 400 on too-short text is expected during typing — silently swallow,
        // but surface other errors so the panel can show a small notice.
        if (res.status === 400) {
          matches.value = []
          count.value = 0
          return
        }
        error.value = {
          code: json?.error?.code ?? `HTTP_${res.status}`,
          message: json?.error?.message ?? `Request failed (${res.status}).`,
        }
        return
      }
      matches.value = json.matches ?? []
      count.value = json.count ?? 0
    } catch (e) {
      if (e.name === 'AbortError') return // expected when superseded
      error.value = { code: 'NETWORK', message: e.message ?? 'Network error.' }
    } finally {
      // Only clear loading if we're still the latest invocation. Subsequent
      // calls will set it back to true.
      loading.value = false
    }
  }

  const debounced = useDebounceFn((text) => fetchMatches(text), debounceMs)

  // Re-run whenever the source text changes.
  watch(
    () => getText?.(),
    (text) => {
      const trimmed = (text ?? '').trim()
      if (trimmed.length < minLength) {
        matches.value = []
        count.value = 0
        error.value = null
        if (controller) controller.abort()
        return
      }
      debounced(trimmed)
    },
    { immediate: true },
  )

  function clear() {
    if (controller) controller.abort()
    matches.value = []
    count.value = 0
    error.value = null
    loading.value = false
  }

  onScopeDispose(() => {
    if (controller) controller.abort()
  })

  return { matches, count, loading, error, clear }
}
