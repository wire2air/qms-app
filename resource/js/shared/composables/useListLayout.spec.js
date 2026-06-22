import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, h, nextTick } from 'vue'
import { useListLayout } from './useListLayout.js'

// Mount inside a component so watch()/onMounted run as in a real setup.
function harness(options) {
  let api
  const Comp = {
    setup() {
      api = useListLayout(options)
      return () => h('div')
    },
  }
  const wrapper = mount(Comp)
  return { api, wrapper }
}

describe('useListLayout — core', () => {
  it('derives content state with loading > error > empty precedence', () => {
    const loading = ref(true)
    const empty = ref(true)
    const { api } = harness({ loading, empty })
    expect(api.state.value).toBe('loading')
    loading.value = false
    expect(api.state.value).toBe('empty')
    empty.value = false
    expect(api.state.value).toBe('ready')
  })

  it('exposes a BaseTable-shaped pagination v-model that reads total from a getter', () => {
    const total = ref(42)
    const { api } = harness({ total, rowsPerPage: 10 })
    expect(api.pagination.value).toMatchObject({ page: 1, rowsPerPage: 10, total: 42 })
    // setter (as BaseTable would emit) updates page + sort, ignores total
    api.pagination.value = { page: 3, sortBy: 'name', descending: true, total: 999 }
    expect(api.page.value).toBe(3)
    expect(api.sortBy.value).toBe('name')
    expect(api.descending.value).toBe(true)
    expect(api.pagination.value.total).toBe(42)
  })

  it('resets to page 1 and clears selection when a filter changes', async () => {
    const { api } = harness({ filters: { search: '', statusId: null } })
    api.page.value = 4
    api.selected.value = ['a', 'b']
    api.filters.value.search = 'acme'
    await nextTick()
    expect(api.page.value).toBe(1)
    expect(api.hasSelection.value).toBe(false)
  })

  it('tracks active filter count via useTableFilters', () => {
    const { api } = harness({ filters: { search: '', siteIds: [] } })
    expect(api.hasActiveFilters.value).toBe(false)
    api.filters.value.siteIds = ['s1']
    expect(api.activeCount.value).toBe(1)
  })
})

describe('useListLayout — URL sync', () => {
  it('hydrates filters, page, and sort from the route query', () => {
    const route = { query: { search: 'acme', siteIds: 's1,s2', page: '3', sort: '-createdAt' } }
    const router = { replace: vi.fn(() => Promise.resolve()) }
    const { api } = harness({
      filters: { search: '', siteIds: [] },
      syncUrl: true,
      route,
      router,
    })
    expect(api.filters.value.search).toBe('acme')
    expect(api.filters.value.siteIds).toEqual(['s1', 's2'])
    expect(api.page.value).toBe(3)
    expect(api.sortBy.value).toBe('createdAt')
    expect(api.descending.value).toBe(true)
  })

  it('pushes changed filters back to the query (page reset, default omitted)', async () => {
    const route = { query: {} }
    const router = { replace: vi.fn(() => Promise.resolve()) }
    const { api } = harness({
      filters: { search: '', statusId: null },
      syncUrl: true,
      route,
      router,
    })
    api.page.value = 5
    api.filters.value.search = 'widget'
    await nextTick()
    const lastCall = router.replace.mock.calls.at(-1)[0]
    expect(lastCall.query).toEqual({ search: 'widget' }) // page reset to 1 → omitted; statusId default → omitted
  })
})
