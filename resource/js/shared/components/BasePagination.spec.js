import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BasePagination from './BasePagination.vue'

function mountPager(props) {
  return mount(BasePagination, { props: { total: 25, page: 1, rowsPerPage: 10, ...props } })
}

describe('BasePagination', () => {
  it('is a labelled navigation region', () => {
    const nav = mountPager().find('nav')
    expect(nav.exists()).toBe(true)
    expect(nav.attributes('aria-label')).toBe('Pagination')
  })

  it('shows the current range and total', () => {
    expect(mountPager({ page: 1, rowsPerPage: 10, total: 25 }).text()).toContain('1-10 of 25')
    expect(mountPager({ page: 3, rowsPerPage: 10, total: 25 }).text()).toContain('21-25 of 25')
  })

  it('disables Previous on the first page and Next on the last', () => {
    const first = mountPager({ page: 1, rowsPerPage: 10, total: 25 })
    expect(first.find('[aria-label="Previous page"]').element.disabled).toBe(true)
    expect(first.find('[aria-label="Next page"]').element.disabled).toBe(false)

    const last = mountPager({ page: 3, rowsPerPage: 10, total: 25 })
    expect(last.find('[aria-label="Next page"]').element.disabled).toBe(true)
  })

  it('emits the next page', async () => {
    const w = mountPager({ page: 2, rowsPerPage: 10, total: 25 })
    await w.find('[aria-label="Next page"]').trigger('click')
    expect(w.emitted('update:page').at(-1)).toEqual([3])
  })

  it('emits the previous page', async () => {
    const w = mountPager({ page: 2, rowsPerPage: 10, total: 25 })
    await w.find('[aria-label="Previous page"]').trigger('click')
    expect(w.emitted('update:page').at(-1)).toEqual([1])
  })

  it('changing rows-per-page emits the new size and resets to page 1', async () => {
    const w = mountPager({ page: 3, rowsPerPage: 10, total: 100 })
    const select = w.find('select')
    await select.setValue('25')
    expect(w.emitted('update:rowsPerPage').at(-1)).toEqual([25])
    expect(w.emitted('update:page').at(-1)).toEqual([1])
  })

  it('hides the rows-per-page control when hideRowsPerPage', () => {
    expect(mountPager({ hideRowsPerPage: true }).find('select').exists()).toBe(false)
  })
})
