import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import DataTable from './DataTable.vue'
import BasePagination from '../BasePagination.vue'

// persistKey persists via an INJECTED adapter (the app provides one backed by the
// synced User.settings bag). Tests inject a fake in-memory adapter — no app/session
// module chain is loaded.
const PERSIST_INJECT = 'qms:dataTableViewPersist'
function fakePersist(bag, ready = true) {
  return {
    ready: { value: ready },
    get: (key) => (`tableView:${key}` in bag ? bag[`tableView:${key}`] : null),
    set: (key, value) => {
      bag[`tableView:${key}`] = value
    },
  }
}

/** Force vueuse's useMediaQuery to report a mobile (matching) viewport. */
function mockMatchMedia(matches) {
  window.matchMedia = (query) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}
afterEach(() => {
  delete window.matchMedia
})

const columns = [
  { name: 'name', label: 'Name', field: 'name', sortable: true },
  { name: 'role', label: 'Role', field: 'role' }, // not sortable
]
const rows = [
  { id: 1, name: 'Beta', role: 'Engineer' },
  { id: 2, name: 'Alpha', role: 'Admiral' },
  { id: 3, name: 'Gamma', role: 'Analyst' },
]

function bodyText(w) {
  return w.findAll('tbody tr').map((tr) => tr.findAll('td').map((td) => td.text()))
}

describe('DataTable — rendering & slots', () => {
  it('renders every row via the default cell renderer', () => {
    const w = mount(DataTable, { props: { columns, rows, hidePagination: true } })
    const trs = w.findAll('tbody tr')
    expect(trs).toHaveLength(3)
    expect(trs[0].text()).toContain('Beta')
    expect(trs[0].text()).toContain('Engineer')
  })

  it('prefers a #body-cell-{name} slot when provided', () => {
    const w = mount(DataTable, {
      props: { columns, rows, hidePagination: true },
      slots: { 'body-cell-name': `<template #body-cell-name="{ value }"><b>{{ value }}!</b></template>` },
    })
    expect(w.find('tbody tr td b').text()).toBe('Beta!')
  })
})

describe('DataTable — header a11y & sorting (engine-backed)', () => {
  it('marks headers with scope=col and aria-sort only on sortable columns', () => {
    const w = mount(DataTable, { props: { columns, rows } })
    const ths = w.findAll('thead th')
    expect(ths.every((th) => th.attributes('scope') === 'col')).toBe(true)
    expect(ths[0].attributes('aria-sort')).toBe('none')
    expect(ths[1].attributes('aria-sort')).toBeUndefined()
  })

  it('renders sortable headers as real <button>s and sorts rows on click', async () => {
    const w = mount(DataTable, { props: { columns, rows, hidePagination: true } })
    expect(w.findAll('thead th')[0].find('button').exists()).toBe(true)
    expect(w.findAll('thead th')[1].find('button').exists()).toBe(false)

    await w.find('thead th button').trigger('click') // ascending
    expect(bodyText(w)[0][0]).toBe('Alpha')
    expect(w.find('thead th').attributes('aria-sort')).toBe('ascending')

    await w.find('thead th button').trigger('click') // descending
    expect(bodyText(w)[0][0]).toBe('Gamma')
    expect(w.find('thead th').attributes('aria-sort')).toBe('descending')
  })
})

describe('DataTable — selection', () => {
  it('select-all toggles every page row and writes back the row keys', async () => {
    const captured = []
    const w = mount(DataTable, {
      props: {
        columns,
        rows,
        selectable: true,
        hidePagination: true,
        'onUpdate:selected': (v) => captured.push(v),
      },
    })
    await w.find('thead input[type="checkbox"]').setValue(true)
    const last = captured.at(-1)
    expect(last.map(String).sort()).toEqual(['1', '2', '3'])
  })

  it('reflects an incoming v-model:selected as checked rows + aria-selected', () => {
    const w = mount(DataTable, {
      props: { columns, rows, selectable: true, selected: [2], hidePagination: true },
    })
    const trs = w.findAll('tbody tr')
    expect(trs[0].attributes('aria-selected')).toBe('false')
    expect(trs[1].attributes('aria-selected')).toBe('true')
  })
})

describe('DataTable — state machine', () => {
  it('shows the empty state when there are no rows at all', () => {
    const w = mount(DataTable, { props: { columns, rows: [] } })
    expect(w.text()).toContain('No data yet')
  })

  it('distinguishes no-results (data exists but filtered out) from empty', async () => {
    const w = mount(DataTable, { props: { columns, rows, search: 'zzz-nomatch' } })
    expect(w.text()).toContain('No matching results')
    expect(w.text()).not.toContain('No data yet')
  })

  it('shows the error state with the error message and a retry button', () => {
    const w = mount(DataTable, { props: { columns, rows, error: 'Boom failed' } })
    expect(w.text()).toContain('Something went wrong')
    expect(w.text()).toContain('Boom failed')
    const retry = w.findAll('button').find((b) => b.text().includes('Retry'))
    expect(retry).toBeTruthy()
  })

  it('shows the skeleton while loading with no rows yet', () => {
    const w = mount(DataTable, { props: { columns, rows: [], loading: true } })
    expect(w.find('[aria-busy="true"]').exists()).toBe(true)
    expect(w.text()).not.toContain('No data yet')
  })

  it('honors an explicit denied state', () => {
    const w = mount(DataTable, { props: { columns, rows, state: 'denied' } })
    expect(w.text()).toContain('don’t have access')
  })
})

describe('DataTable — toolbar features', () => {
  it('renders no toolbar when no toolbar feature is enabled', () => {
    const w = mount(DataTable, { props: { columns, rows, hidePagination: true } })
    expect(w.find('input[type="search"]').exists()).toBe(false)
  })

  it('renders a search box when searchable and filters via the engine', async () => {
    const w = mount(DataTable, { props: { columns, rows, searchable: true, hidePagination: true } })
    const input = w.find('input[type="search"]')
    expect(input.exists()).toBe(true)
    await input.setValue('Alpha')
    // debounced (200ms) — wait it out, then the engine should filter to 1 row
    await new Promise((r) => setTimeout(r, 260))
    await w.vm.$nextTick()
    expect(w.findAll('tbody tr')).toHaveLength(1)
    expect(w.find('tbody tr').text()).toContain('Alpha')
  })

  it('reacts to engine column visibility (column manager wiring)', async () => {
    const w = mount(DataTable, { props: { columns, rows, columnManager: true, hidePagination: true } })
    expect(w.findAll('thead th')).toHaveLength(2)
    // The toolbar exposes the engine; hiding a column drops its header.
    w.vm.table.getColumn('role').toggleVisibility(false)
    await w.vm.$nextTick()
    expect(w.findAll('thead th')).toHaveLength(1)
    expect(w.findAll('thead th').map((th) => th.text())).not.toContain('Role')
  })

  it('renders config-driven bulk actions and runs them with the selected keys', async () => {
    let received = null
    const bulkActions = [{ key: 'archive', label: 'Archive', run: (sel) => (received = sel) }]
    const w = mount(DataTable, {
      props: { columns, rows, selectable: true, selected: [1, 3], bulkActions, hidePagination: true },
    })
    expect(w.text()).toContain('2 selected')
    const btn = w.findAll('button').find((b) => b.text().includes('Archive'))
    await btn.trigger('click')
    expect(received.map(String).sort()).toEqual(['1', '3'])
  })
})

describe('DataTable — virtualization', () => {
  const many = Array.from({ length: 500 }, (_, i) => ({
    id: i + 1,
    name: `Person ${i + 1}`,
    role: 'Engineer',
  }))

  it('mounts without error and suppresses pagination when virtualizing', () => {
    const w = mount(DataTable, { props: { columns, rows: many, virtualize: true } })
    // Pagination is replaced by an internal scroll region.
    expect(w.findComponent(BasePagination).exists()).toBe(false)
  })

  it('keeps pagination for the normal (non-virtual) path', () => {
    const w = mount(DataTable, { props: { columns, rows: many } })
    expect(w.findComponent(BasePagination).exists()).toBe(true)
  })
})

describe('DataTable — mobile cards', () => {
  it('renders a stacked card list (not a table) on a mobile viewport', async () => {
    mockMatchMedia(true)
    const w = mount(DataTable, { props: { columns, rows, hidePagination: true } })
    await w.vm.$nextTick()
    expect(w.find('table').exists()).toBe(false)
    // First column is the card title; remaining columns become labelled meta.
    expect(w.text()).toContain('Beta') // primary (name)
    expect(w.text()).toContain('Role') // meta label
    expect(w.text()).toContain('Engineer') // meta value
  })

  it('renders the table (no cards) on a desktop viewport', async () => {
    mockMatchMedia(false)
    const w = mount(DataTable, { props: { columns, rows, hidePagination: true } })
    await w.vm.$nextTick()
    expect(w.find('table').exists()).toBe(true)
  })

  it('keeps the table on mobile when mobileCards is disabled', async () => {
    mockMatchMedia(true)
    const w = mount(DataTable, { props: { columns, rows, mobileCards: false, hidePagination: true } })
    await w.vm.$nextTick()
    expect(w.find('table').exists()).toBe(true)
  })
})

describe('DataTable — row actions', () => {
  it('appends an actions column and fires the handler with the original row', async () => {
    const calls = []
    const rowActions = [{ key: 'edit', label: 'Edit', onClick: (r) => calls.push(r) }]
    const w = mount(DataTable, { props: { columns, rows, rowActions, hidePagination: true } })
    // One extra header column for actions.
    expect(w.findAll('thead th')).toHaveLength(3)
    const firstRowEdit = w
      .findAll('tbody tr')[0]
      .findAll('button')
      .find((b) => b.attributes('aria-label') === 'Edit')
    expect(firstRowEdit).toBeTruthy()
    await firstRowEdit.trigger('click')
    expect(calls).toEqual([rows[0]])
  })

  it('supports a row→actions function for per-row gating', () => {
    const rowActions = (r) => (r.id === 1 ? [{ key: 'edit', label: 'Edit', onClick: () => {} }] : [])
    const w = mount(DataTable, { props: { columns, rows, rowActions, hidePagination: true } })
    const trs = w.findAll('tbody tr')
    const hasEdit = (tr) => tr.findAll('button').some((b) => b.attributes('aria-label') === 'Edit')
    expect(hasEdit(trs[0])).toBe(true) // id 1
    expect(hasEdit(trs[1])).toBe(false) // id 2
  })
})

describe('DataTable — column pinning', () => {
  it('seeds pinning from a column `pin` def and renders the header sticky', () => {
    const pinned = [
      { name: 'name', label: 'Name', field: 'name', pin: 'left' },
      { name: 'role', label: 'Role', field: 'role' },
    ]
    const w = mount(DataTable, { props: { columns: pinned, rows, hidePagination: true } })
    expect(w.vm.table.getColumn('name').getIsPinned()).toBe('left')
    const nameTh = w.findAll('thead th').find((th) => th.text().includes('Name'))
    expect(nameTh.attributes('style')).toContain('position: sticky')
    expect(nameTh.attributes('style')).toContain('left:')
  })

  it('leaves unpinned columns without sticky positioning', () => {
    const w = mount(DataTable, { props: { columns, rows, hidePagination: true } })
    const roleTh = w.findAll('thead th').find((th) => th.text().includes('Role'))
    expect(roleTh.attributes('style') || '').not.toContain('position: sticky')
  })
})

describe('DataTable — structured filters', () => {
  it('applies a v-model:filters group to the rows (client mode)', () => {
    const filters = {
      combinator: 'and',
      conditions: [{ id: 'c1', field: 'role', operator: 'equals', value: 'Admiral' }],
    }
    const w = mount(DataTable, { props: { columns, rows, filters, hidePagination: true } })
    expect(w.findAll('tbody tr')).toHaveLength(1)
    expect(w.find('tbody tr').text()).toContain('Alpha')
  })

  it('shows the no-results state when filters exclude everything', () => {
    const filters = {
      combinator: 'and',
      conditions: [{ id: 'c1', field: 'name', operator: 'equals', value: 'nobody' }],
    }
    const w = mount(DataTable, { props: { columns, rows, filters } })
    expect(w.text()).toContain('No matching results')
  })

  it('renders the filter bar when filterable', () => {
    const w = mount(DataTable, { props: { columns, rows, filterable: true, hidePagination: true } })
    expect(w.text()).toContain('Filter')
  })
})

describe('DataTable — expandable rows', () => {
  it('toggles a detail row via the expander and emits row-expand', async () => {
    const w = mount(DataTable, {
      props: { columns, rows, expandable: true, hidePagination: true },
      slots: {
        'row-detail': `<template #row-detail="{ row }"><div class="detail">Detail: {{ row.name }}</div></template>`,
      },
    })
    const exp = w
      .findAll('button')
      .find((b) => b.attributes('aria-label') === 'Toggle row details')
    expect(exp).toBeTruthy()
    expect(w.find('.detail').exists()).toBe(false)
    await exp.trigger('click')
    expect(w.find('.detail').text()).toContain('Detail: Beta')
    expect(w.emitted('row-expand')[0]).toEqual([rows[0], true])
  })

  it('gates expandability per row via a function', () => {
    const w = mount(DataTable, {
      props: { columns, rows, expandable: (r) => r.id === 1, hidePagination: true },
    })
    const expanders = w
      .findAll('button')
      .filter((b) => b.attributes('aria-label') === 'Toggle row details')
    expect(expanders).toHaveLength(1)
  })
})

describe('DataTable — resizable columns & export', () => {
  it('renders resize handles and uses a fixed table layout', () => {
    const w = mount(DataTable, {
      props: { columns, rows, resizableColumns: true, hidePagination: true },
    })
    expect(w.findAll('[data-resize-handle]').length).toBeGreaterThan(0)
    expect(w.find('table').classes()).toContain('tw:table-fixed')
  })

  it('shows an Export button when exportable', () => {
    const w = mount(DataTable, { props: { columns, rows, exportable: true, hidePagination: true } })
    expect(w.findAll('button').some((b) => b.attributes('title') === 'Export CSV')).toBe(true)
  })
})

describe('DataTable — persistKey (synced, injected adapter)', () => {
  it('restores persisted view state from the adapter on mount', async () => {
    const bag = { 'tableView:t1': { columnVisibility: { role: false } } }
    const w = mount(DataTable, {
      props: { columns, rows, persistKey: 't1', hidePagination: true },
      global: { provide: { [PERSIST_INJECT]: fakePersist(bag) } },
    })
    await w.vm.$nextTick()
    expect(w.findAll('thead th').map((th) => th.text())).not.toContain('Role')
  })

  it('saves view state through the adapter when it changes', async () => {
    const bag = {}
    const w = mount(DataTable, {
      props: { columns, rows, persistKey: 't2', columnManager: true },
      global: { provide: { [PERSIST_INJECT]: fakePersist(bag) } },
    })
    w.vm.table.getColumn('role').toggleVisibility(false)
    await new Promise((r) => setTimeout(r, 560)) // debounce 500ms
    expect(bag['tableView:t2'].columnVisibility.role).toBe(false)
  })

  it('does not persist without a persistKey', async () => {
    const bag = {}
    const w = mount(DataTable, {
      props: { columns, rows, columnManager: true },
      global: { provide: { [PERSIST_INJECT]: fakePersist(bag) } },
    })
    w.vm.table.getColumn('role').toggleVisibility(false)
    await new Promise((r) => setTimeout(r, 560))
    expect(Object.keys(bag)).toHaveLength(0)
  })

  it('is inert when no persistence adapter is provided', async () => {
    const w = mount(DataTable, { props: { columns, rows, persistKey: 't3', columnManager: true } })
    // No provider → no throw, column toggle still works locally.
    w.vm.table.getColumn('role').toggleVisibility(false)
    await w.vm.$nextTick()
    expect(w.findAll('thead th').map((th) => th.text())).not.toContain('Role')
  })
})

describe('DataTable — keyboard-operable rows', () => {
  it('rows are inert without a row-click listener', () => {
    const w = mount(DataTable, { props: { columns, rows, hidePagination: true } })
    expect(w.find('tbody tr').attributes('tabindex')).toBeUndefined()
  })

  it('Enter on a focused row activates it with the original row + index', async () => {
    const calls = []
    const w = mount(DataTable, {
      props: { columns, rows, hidePagination: true },
      attrs: { onRowClick: (...a) => calls.push(a) },
    })
    const tr = w.find('tbody tr')
    expect(tr.attributes('tabindex')).toBe('0')
    await tr.trigger('keydown.enter')
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toEqual(rows[0])
    expect(calls[0][1]).toBe(0)
  })
})
