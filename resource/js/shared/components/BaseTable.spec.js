import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseTable from './BaseTable.vue'

const columns = [
  { name: 'title', label: 'Title', field: 'title', sortable: true },
  { name: 'owner', label: 'Owner', field: 'owner' }, // not sortable
]
const rows = [
  { id: 1, title: 'Beta', owner: 'Sam' },
  { id: 2, title: 'Alpha', owner: 'Jane' },
]

describe('BaseTable — header a11y (scope / aria-sort / keyboard sort)', () => {
  it('marks every column header with scope="col"', () => {
    const w = mount(BaseTable, { props: { columns, rows } })
    const ths = w.findAll('thead th')
    expect(ths.length).toBe(2)
    expect(ths.every((th) => th.attributes('scope') === 'col')).toBe(true)
  })

  it('exposes aria-sort on sortable columns (none until sorted) and omits it on non-sortable', () => {
    const w = mount(BaseTable, { props: { columns, rows } })
    const ths = w.findAll('thead th')
    expect(ths[0].attributes('aria-sort')).toBe('none')
    expect(ths[1].attributes('aria-sort')).toBeUndefined()
  })

  it('renders the sortable header as a real <button> and not the non-sortable one', () => {
    const w = mount(BaseTable, { props: { columns, rows } })
    const ths = w.findAll('thead th')
    expect(ths[0].find('button').exists()).toBe(true)
    expect(ths[1].find('button').exists()).toBe(false)
  })

  it('sorting via the header button updates pagination and aria-sort', async () => {
    const w = mount(BaseTable, {
      props: { columns, rows, 'onUpdate:pagination': (p) => w.setProps({ pagination: p }) },
    })
    await w.find('thead th button').trigger('click')
    expect(w.props('pagination').sortBy).toBe('title')
    expect(w.find('thead th').attributes('aria-sort')).toBe('ascending')
    // second activation flips direction
    await w.find('thead th button').trigger('click')
    expect(w.find('thead th').attributes('aria-sort')).toBe('descending')
  })

  it('selection checkboxes carry accessible names', () => {
    const w = mount(BaseTable, { props: { columns, rows, selectable: true } })
    const boxes = w.findAll('input[type="checkbox"]')
    expect(boxes[0].attributes('aria-label')).toBe('Select all rows')
    expect(boxes[1].attributes('aria-label')).toBe('Select row')
  })
})
