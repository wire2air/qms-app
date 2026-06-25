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
  it('lists only hideable, labelled columns', () => {
    const { w } = mountManager()
    const items = w.findAll('[role="menuitemcheckbox"]')
    const labels = items.map((i) => i.text())
    expect(labels.some((l) => l.includes('Name'))).toBe(true)
    expect(labels.some((l) => l.includes('Role'))).toBe(true)
    expect(labels.some((l) => l.includes('Locked'))).toBe(false) // hideable:false
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
    const { host, w } = mountManager()
    const items = w.findAll('[role="menuitemcheckbox"]')
    const name = items.find((i) => i.text().includes('Name'))
    const role = items.find((i) => i.text().includes('Role'))
    await role.trigger('click') // hide Role → only Name left
    await name.trigger('click') // attempt to hide Name → blocked
    expect(host.vm.table.getColumn('name').getIsVisible()).toBe(true)
  })
})
