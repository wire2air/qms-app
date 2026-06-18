import { computed, unref } from 'vue'

/**
 * usePagination — pagination math (total pages, the "start-end of total" range
 * label, clamped page navigation, page-size changes), extracted from
 * BasePagination so non-table lists can paginate with the same logic.
 *
 * @param {import('vue').Ref<number>} page          current page (1-based; mutated by go/setRowsPerPage)
 * @param {import('vue').Ref<number>} rowsPerPage    page size (mutated by setRowsPerPage)
 * @param {import('vue').Ref<number>|(() => number)} total  total item count (ref or getter)
 */
export function usePagination(page, rowsPerPage, total) {
  const totalCount = computed(() => (typeof total === 'function' ? total() : unref(total)) || 0)

  const totalPages = computed(() =>
    rowsPerPage.value > 0 ? Math.max(1, Math.ceil(totalCount.value / rowsPerPage.value)) : 1,
  )

  const range = computed(() => {
    if (totalCount.value === 0) return { start: 0, end: 0 }
    return {
      start: (page.value - 1) * rowsPerPage.value + 1,
      end: Math.min(page.value * rowsPerPage.value, totalCount.value),
    }
  })

  const label = computed(() => `${range.value.start}-${range.value.end} of ${totalCount.value}`)

  const isFirst = computed(() => page.value <= 1)
  const isLast = computed(() => page.value >= totalPages.value)

  // Clamp to [1, totalPages]; only writes when it actually changes.
  function go(next) {
    const target = Math.min(Math.max(1, next), totalPages.value)
    if (target !== page.value) page.value = target
  }

  // Changing page size resets to page 1.
  function setRowsPerPage(n) {
    rowsPerPage.value = n
    page.value = 1
  }

  return { totalPages, range, label, isFirst, isLast, go, setRowsPerPage }
}
