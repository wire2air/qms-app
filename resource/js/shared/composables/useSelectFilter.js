import { ref, computed, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'

/**
 * Search/filter behavior for BaseSelect.
 *
 * - Local mode (default): filters the normalized options in-memory by label.
 * - Remote mode (`remote: true`, i.e. a `@filter` listener is bound): emits a
 *   debounced `filter` event and leaves the option list untouched — the parent
 *   owns `loading` + `options`. Local filtering is bypassed.
 *
 * @param {import('vue').Ref} normalizedOptions  from useSelectOptions
 * @param {object} cfg
 * @param {() => boolean} cfg.remote       whether remote filtering is active
 * @param {(query: string) => void} cfg.emitFilter  fired (debounced) in remote mode
 * @param {() => number} cfg.debounce      debounce window in ms
 */
export function useSelectFilter(normalizedOptions, cfg) {
  const query = ref('')

  const emitDebounced = useDebounceFn((q) => {
    cfg.emitFilter(q)
  }, cfg.debounce)

  watch(query, (q) => {
    if (cfg.remote()) emitDebounced(q)
  })

  const filteredOptions = computed(() => {
    // Remote mode: the parent already returned the matching options.
    if (cfg.remote()) return normalizedOptions.value
    const q = query.value.trim().toLowerCase()
    if (!q) return normalizedOptions.value
    return normalizedOptions.value.filter((o) => o.label.toLowerCase().includes(q))
  })

  function reset() {
    query.value = ''
  }

  return { query, filteredOptions, reset }
}
