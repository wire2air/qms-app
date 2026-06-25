import { ref, computed, watch, toValue } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTableFilters } from './useTableFilters.js'
import { usePagination } from './usePagination.js'
import {
  resolveListState,
  filtersToQuery,
  queryToFilters,
  encodeSort,
  decodeSort,
} from './listLayoutHelpers.js'

function flag(v) {
  return typeof v === 'function' ? !!v() : !!toValue(v)
}

/**
 * Headless core for the list/index page (Enterprise Page Framework A3 / L1).
 * Composes filter state (useTableFilters), pagination math (usePagination),
 * selection, resolved content state, and optional URL query-sync into one API
 * a list page can bind straight onto <BaseFilterBar> + <DataTable>.
 *
 * @param {Object} o
 * @param {Record<string, any>} [o.filters]  initial/default filter values (also defines the key set + types)
 * @param {number}  [o.rowsPerPage]          initial page size (default 25)
 * @param {*}       [o.total]                total row count — ref, getter, or value
 * @param {*}       [o.loading] @param {*} [o.error] @param {*} [o.empty]  ref|getter|value content-state flags
 * @param {boolean} [o.syncUrl]              mirror filters/page/sort into the route query (default false)
 * @param {object}  [o.route] @param {object} [o.router]  injected for testing; defaults to useRoute()/useRouter()
 */
export function useListLayout(o = {}) {
  const {
    filters: initialFilters = {},
    rowsPerPage: initialRowsPerPage = 25,
    total,
    loading,
    error,
    empty,
    syncUrl = false,
  } = o

  const defaults = { ...initialFilters }
  const { filters, activeCount, hasActiveFilters, reset, resetKey, isActive } =
    useTableFilters(initialFilters)

  // Pagination + sort
  const page = ref(1)
  const rowsPerPage = ref(initialRowsPerPage)
  const sortBy = ref(null)
  const descending = ref(false)

  // BaseTable v-model:pagination object. `total` is read from the prop/getter,
  // never written back.
  const pagination = computed({
    get: () => ({
      page: page.value,
      rowsPerPage: rowsPerPage.value,
      sortBy: sortBy.value,
      descending: descending.value,
      total: toValue(total) ?? 0,
    }),
    set: (v) => {
      if (!v) return
      if (v.page != null) page.value = v.page
      if (v.rowsPerPage != null) rowsPerPage.value = v.rowsPerPage
      if (v.sortBy !== undefined) sortBy.value = v.sortBy
      if (v.descending != null) descending.value = v.descending
    },
  })

  // DataTable v-model shapes — `tablePagination` ({ page, pageSize }) + `sort`
  // ([{ id, desc }]) — backed by the same page/rowsPerPage/sortBy/descending refs
  // (so URL-sync still works). Use these when binding to <DataTable>; the legacy
  // `pagination` object above is retained for any non-DataTable paginated consumer.
  const tablePagination = computed({
    get: () => ({ page: page.value, pageSize: rowsPerPage.value }),
    set: (v) => {
      if (!v) return
      if (v.page != null) page.value = v.page
      if (v.pageSize != null) rowsPerPage.value = v.pageSize
    },
  })
  const sort = computed({
    get: () => (sortBy.value ? [{ id: sortBy.value, desc: !!descending.value }] : []),
    set: (v) => {
      const s = Array.isArray(v) ? v[0] : null
      sortBy.value = s?.id ?? null
      descending.value = s?.desc ?? false
    },
  })

  const paged = usePagination(page, rowsPerPage, () => toValue(total) ?? 0)

  // Selection
  const selected = ref([])
  const hasSelection = computed(() => selected.value.length > 0)
  const selectedCount = computed(() => selected.value.length)
  function clearSelection() {
    selected.value = []
  }

  // ---- URL sync: hydrate FIRST (before the page-reset watcher exists, so the
  // hydrate mutation doesn't clobber the page restored from the query) ----
  let router = null
  if (syncUrl) {
    const route = o.route ?? useRoute()
    router = o.router ?? useRouter()
    if (route && router) {
      Object.assign(filters.value, queryToFilters(route.query, defaults))
      const p = Number(route.query.page)
      if (Number.isInteger(p) && p > 1) page.value = p
      if (route.query.sort) {
        const decoded = decodeSort(String(route.query.sort))
        sortBy.value = decoded.sortBy
        descending.value = decoded.descending
      }
    } else {
      router = null
    }
  }

  // User-driven filter change → back to page 1 and drop stale selection.
  watch(
    filters,
    () => {
      page.value = 1
      clearSelection()
    },
    { deep: true },
  )

  // Push state → query (registered after hydrate so it never fights the URL).
  if (router) {
    watch(
      [filters, page, sortBy, descending],
      () => {
        const query = filtersToQuery(filters.value, defaults)
        if (page.value > 1) query.page = String(page.value)
        const encodedSort = encodeSort(sortBy.value, descending.value)
        if (encodedSort) query.sort = encodedSort
        Promise.resolve(router.replace({ query })).catch(() => {})
      },
      { deep: true },
    )
  }

  const state = computed(() =>
    resolveListState({ loading: flag(loading), error: flag(error), empty: flag(empty) }),
  )

  return {
    // filters
    filters,
    activeCount,
    hasActiveFilters,
    reset,
    resetKey,
    isActive,
    // pagination / sort
    page,
    rowsPerPage,
    sortBy,
    descending,
    pagination,
    tablePagination,
    sort,
    paged,
    // selection
    selected,
    hasSelection,
    selectedCount,
    clearSelection,
    // resolved content state
    state,
  }
}
