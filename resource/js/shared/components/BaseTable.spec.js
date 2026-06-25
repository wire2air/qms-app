import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseTable from './BaseTable.vue'

// BaseTable is now a backward-compatible adapter over DataTable. These tests pin
// the LEGACY CONTRACT the ~26 consumers depend on: columns/rows, the
// { page, rowsPerPage, sortBy, descending } pagination v-model, selection,
// row-click, the columnToggle/showDensityToggle flags, and slot forwarding.

const columns = [
  { name: 'title', label: 'Title', field: 'title', sortable: true },
  { name: 'owner', label: 'Owner', field: 'owner' }, // not sortable
]
const rows = [
  { id: 1, title: 'Beta', owner: 'Sam' },
  { id: 2, title: 'Alpha', owner: 'Jane' },
]

describe('BaseTable adapter — rendering & slots', () => {
  it('renders rows and forwards #body-cell-{name} slots', () => {
    const w = mount(BaseTable, {
      props: { columns, rows },
      slots: {
        'body-cell-title': `<template #body-cell-title="{ value }"><b>{{ value }}!</b></template>`,
      },
    })
    expect(w.find('tbody tr td b').text()).toBe('Beta!')
  })

  it('keeps scope=col and aria-sort on the header (delegated to DataTable)', () => {
    const w = mount(BaseTable, { props: { columns, rows } })
    const ths = w.findAll('thead th')
    expect(ths.every((th) => th.attributes('scope') === 'col')).toBe(true)
    expect(ths[0].attributes('aria-sort')).toBe('none')
    expect(ths[1].attributes('aria-sort')).toBeUndefined()
  })
})

describe('BaseTable adapter — legacy pagination v-model bridge', () => {
  it('translates header sorting into legacy { sortBy, descending }', async () => {
    const w = mount(BaseTable, {
      props: { columns, rows, 'onUpdate:pagination': (p) => w.setProps({ pagination: p }) },
    })
    await w.find('thead th button').trigger('click')
    expect(w.props('pagination').sortBy).toBe('title')
    expect(w.props('pagination').descending).toBe(false)
    expect(w.find('thead th').attributes('aria-sort')).toBe('ascending')

    await w.find('thead th button').trigger('click')
    expect(w.props('pagination').descending).toBe(true)
    expect(w.find('thead th').attributes('aria-sort')).toBe('descending')
  })

  it('reads an initial legacy sort from rowsPerPage/sortBy', () => {
    const w = mount(BaseTable, {
      props: {
        columns,
        rows,
        pagination: { page: 1, rowsPerPage: 25, sortBy: 'title', descending: true, total: null },
      },
    })
    // Beta/Alpha sorted descending by title → Beta first.
    expect(w.findAll('tbody tr')[0].text()).toContain('Beta')
    expect(w.find('thead th').attributes('aria-sort')).toBe('descending')
  })
})

describe('BaseTable adapter — selection', () => {
  it('renders selection checkboxes and writes back selected keys', async () => {
    const captured = []
    const w = mount(BaseTable, {
      props: { columns, rows, selectable: true, 'onUpdate:selected': (v) => captured.push(v) },
    })
    const boxes = w.findAll('input[type="checkbox"]')
    expect(boxes.length).toBeGreaterThan(0)
    await boxes[0].setValue(true)
    expect(captured.at(-1).map(String).sort()).toEqual(['1', '2'])
  })

  it('forwards the #bulk-actions slot when rows are selected', () => {
    const w = mount(BaseTable, {
      props: { columns, rows, selectable: true, selected: [1] },
      slots: {
        'bulk-actions': `<template #bulk-actions="{ selected, clear }"><button @click="clear">Clear {{ selected.length }}</button></template>`,
      },
    })
    expect(w.text()).toContain('Clear 1')
  })
})

describe('BaseTable adapter — row-click & toolbar flags', () => {
  it('rows are inert without a row-click listener', () => {
    const w = mount(BaseTable, { props: { columns, rows } })
    expect(w.find('tbody tr').attributes('tabindex')).toBeUndefined()
  })

  it('emits row-click (and rows become keyboard-operable) when listened', async () => {
    const w = mount(BaseTable, { props: { columns, rows }, attrs: { onRowClick: () => {} } })
    const tr = w.find('tbody tr')
    expect(tr.attributes('tabindex')).toBe('0')
    await tr.trigger('keydown.enter')
    expect(w.emitted('row-click')[0][0]).toEqual(rows[0])
    expect(w.emitted('row-click')[0][1]).toBe(0)
  })

  it('columnToggle and showDensityToggle render their controls', () => {
    const w = mount(BaseTable, {
      props: { columns, rows, columnToggle: true, showDensityToggle: true },
    })
    const titles = w.findAll('button').map((b) => b.attributes('title'))
    expect(titles).toContain('Columns')
    expect(titles).toContain('Row density')
  })
})
