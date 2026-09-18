/**
 * useAutoSave — debounced inline-edit autosave for a SyncEngine model.
 *
 * Extracts the copy-pasted block (isFirstLoad + useDebounceFn + deep watch +
 * isSaving/saveError) documented in CLAUDE.md. Deep-watches the entity, skips
 * the first trigger (the initial load from the live query), then debounce-saves
 * on every subsequent change.
 *
 *   const group = useLiveQueryWithDeps(...)
 *   const { isSaving, saveError } = useAutoSave(group)            // simplest
 *   const { isSaving, saveError } = useAutoSave(user, { enabled: canUpdate })
 *
 * For pages that build a custom save payload, watch extra refs, or seed local
 * state on first load, keep the manual pattern — this covers the plain
 * `entity.save()` case only.
 *
 * @param {import('vue').Ref|Function} source ref/getter resolving to the model
 * @param {Object} [options]
 * @param {number} [options.debounce=500]
 * @param {import('vue').Ref|Function|boolean} [options.enabled] gate — skip save when falsy
 * @param {(err: Error) => void} [options.onError]
 */
import { ref, watch, toValue } from 'vue'
import { useDebounceFn } from '@vueuse/core'

export function useAutoSave(source, options = {}) {
  const { debounce = 500, enabled, onError } = options
  const isSaving = ref(false)
  const saveError = ref(null)
  let isFirstLoad = true

  const save = useDebounceFn(async () => {
    const entity = toValue(source)
    if (!entity) return
    if (enabled !== undefined && !toValue(enabled)) return
    isSaving.value = true
    saveError.value = null
    try {
      await entity.save()
    } catch (err) {
      saveError.value = err?.message || 'Failed to save'
      onError?.(err)
    } finally {
      isSaving.value = false
    }
  }, debounce)

  watch(
    source,
    (val) => {
      // Skip the first trigger — the live query landing its initial value.
      if (isFirstLoad) {
        isFirstLoad = false
        return
      }
      if (val) save()
    },
    { deep: true },
  )

  return { isSaving, saveError, save }
}
