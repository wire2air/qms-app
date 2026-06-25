import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DataTable from './DataTable.vue'
import TableColumnManager from './TableColumnManager.vue'

// Render BasePopover's button + content inline so we can drive the menu without
// fighting headlessui's teleport/open state in jsdom.
const stubs = {
  BasePopover: { template: '<div><slot name="button" /><slot name="content" /></div>' },
}

const columns = [
  { name: 'name', label: 'Name', field: 'name' },
  { name: 'role', label: 'Role', field: 'role' },
  { name: 'locked', label: 'Locked', field: 'locked', hideable: false },
]
const rows = [{ id: 1, name: 'Ada', role: 'Engineer', locked: 'x' }]

function mountManager() {
  // Borrow a real engine instance from a mounted DataTable.
  const host = mount(DataTable, { props: { columns, rows } })
  const w = mount(TableColumnManager, { props: { table: host.vm.table }, global: { stubs } })
  return { host, w }
}

describe('TableColumnManager', () => {
  it('lists every labelled column (for reorder) but locks visibility on non-hideable ones', () => {
    const { w } = mountManager()
    const items = w.findAll('[role="menuitemcheckbox"]')
    const labels = items.map((i) => i.text())
    expect(labels.some((l) => l.includes('Name'))).toBe(true)
    expect(labels.some((l) => l.includes('Role'))).toBe(true)
    // Non-hideable columns now appear too (so they can be reordered)…
    const locked = items.find((i) => i.text().includes('Locked'))
    expect(locked).toBeTruthy()
    // …but their visibility toggle is disabled.
    expect(locked.attributes('disabled')).toBeDefined()
  })

  it('toggles a column off and back on', async () => {
    const { host, w } = mountManager()
    const roleItem = w.findAll('[role="menuitemcheckbox"]').find((i) => i.text().includes('Role'))
    expect(host.vm.table.getColumn('role').getIsVisible()).toBe(true)
    await roleItem.trigger('click')
    expect(host.vm.table.getColumn('role').getIsVisible()).toBe(false)
    expect(roleItem.attributes('aria-checked')).toBe('false')
    await roleItem.trigger('click')
    expect(host.vm.table.getColumn('role').getIsVisible()).toBe(true)
  })

  it('reorders a column up/down via the engine columnOrder', async () => {
    const { host, w } = mountManager()
    const order = () => host.vm.table.getAllLeafColumns().map((c) => c.id)
    expect(order()).toEqual(['name', 'role', 'locked'])

    // One up-button per column, in row order [name, role, locked]; move "role" up.
    const upButtons = w.findAll('[aria-label="Move column up"]')
    await upButtons[1].trigger('click')
    expect(order()).toEqual(['role', 'name', 'locked'])

    // Move it back down.
    const downButtons = w.findAll('[aria-label="Move column down"]')
    await downButtons[0].trigger('click') // "role" is now first
    expect(order()).toEqual(['name', 'role', 'locked'])
  })

  it('pins and unpins a column to the left', async () => {
    const { host, w } = mountManager()
    const pinBtn = w.findAll('button').find((b) => b.attributes('title') === 'Pin column left')
    expect(pinBtn).toBeTruthy()
    await pinBtn.trigger('click')
    expect(host.vm.table.getColumn('name').getIsPinned()).toBe('left')
    // Now it offers to unpin.
    const unpin = w.findAll('button').find((b) => b.attributes('title') === 'Unpin column')
    await unpin.trigger('click')
    expect(host.vm.table.getColumn('name').getIsPinned()).toBe(false)
  })

  it('refuses to hide the last visible column', async () => {
    // All-hideable columns so the guard is actually reachable.
    const cols2 = [
      { name: 'a', label: 'Alpha', field: 'a' },
      { name: 'b', label: 'Bravo', field: 'b' },
    ]
    const host = mount(DataTable, { props: { columns: cols2, rows: [{ id: 1, a: 'x', b: 'y' }] } })
    const w = mount(TableColumnManager, { props: { table: host.vm.table }, global: { stubs } })
    const items = w.findAll('[role="menuitemcheckbox"]')
    await items.find((i) => i.text().includes('Bravo')).trigger('click') // hide b → only a
    await items.find((i) => i.text().includes('Alpha')).trigger('click') // blocked
    expect(host.vm.table.getColumn('a').getIsVisible()).toBe(true)
  })
})
