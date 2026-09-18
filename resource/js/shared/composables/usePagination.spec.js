import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { usePagination } from './usePagination.js'

describe('usePagination', () => {
  it('computes total pages from total / page size', () => {
    const { totalPages } = usePagination(ref(1), ref(10), ref(25))
    expect(totalPages.value).toBe(3)
  })

  it('reports the current range label', () => {
    expect(usePagination(ref(1), ref(10), ref(25)).label.value).toBe('1-10 of 25')
    expect(usePagination(ref(3), ref(10), ref(25)).label.value).toBe('21-25 of 25')
  })

  it('handles an empty list', () => {
    const { totalPages, label } = usePagination(ref(1), ref(10), ref(0))
    expect(totalPages.value).toBe(1)
    expect(label.value).toBe('0-0 of 0')
  })

  it('flags first/last page', () => {
    const first = usePagination(ref(1), ref(10), ref(25))
    expect(first.isFirst.value).toBe(true)
    expect(first.isLast.value).toBe(false)
    const last = usePagination(ref(3), ref(10), ref(25))
    expect(last.isLast.value).toBe(true)
  })

  it('go() clamps to the valid range and only writes on change', () => {
    const page = ref(2)
    const { go } = usePagination(page, ref(10), ref(25))
    go(3)
    expect(page.value).toBe(3)
    go(99) // clamp to last (3)
    expect(page.value).toBe(3)
    go(0) // clamp to first
    expect(page.value).toBe(1)
  })

  it('setRowsPerPage() changes size and resets to page 1', () => {
    const page = ref(3)
    const rpp = ref(10)
    const { setRowsPerPage } = usePagination(page, rpp, ref(100))
    setRowsPerPage(25)
    expect(rpp.value).toBe(25)
    expect(page.value).toBe(1)
  })

  it('accepts total as a (reactive) getter', () => {
    const t = ref(50)
    const { totalPages } = usePagination(ref(1), ref(10), () => t.value)
    expect(totalPages.value).toBe(5)
    t.value = 30
    expect(totalPages.value).toBe(3)
  })
})
