import { ref, computed } from 'vue'

/**
 * useTableFilters — standard reactive filter state for list/table pages.
 *
 * Replaces the copy-pasted `const filters = ref({...})` + ad-hoc reset logic
 * scattered across ~20 table pages. Pair with <BaseFilterBar> for the UI.
 *
 *   const { filters, hasActiveFilters, activeCount, reset } =
 *     useTableFilters({ search: '', statusId: null, siteIds: [] })
 *
 * `activeCount` / `hasActiveFilters` compare against the initial values, so an
 * untouched filter doesn't count. Arrays count when non-empty.
 *
 * @param {Record<string, any>} initial  default filter values
 */
export function useTableFilters(initial = {}) {
  const defaults = { ...initial }
  const filters = ref({ ...initial })

  function isActive(key) {
    const v = filters.value[key]
    const d = defaults[key]
    if (Array.isArray(v)) return v.length > 0
    return v !== d && v !== '' && v !== null && v !== undefined
  }

  const activeCount = computed(() => Object.keys(defaults).filter(isActive).length)
  const hasActiveFilters = computed(() => activeCount.value > 0)

  function reset() {
    filters.value = { ...defaults }
  }

  function resetKey(key) {
    filters.value = { ...filters.value, [key]: defaults[key] }
  }

  return { filters, activeCount, hasActiveFilters, reset, resetKey, isActive }
}
