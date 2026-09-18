import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TableRowActions from './TableRowActions.vue'

const stubs = {
  // Render BasePopover button + content inline (no teleport/headlessui in jsdom).
  BasePopover: {
    template: '<div><slot name="button" /><slot name="content" :close="() => {}" /></div>',
  },
  RouterLink: { props: ['to'], template: '<a :href="String(to)"><slot /></a>' },
}

const row = { id: 7, name: 'Ada' }

describe('TableRowActions', () => {
  it('renders visible actions as inline quick buttons and runs onClick with the row', async () => {
    const calls = []
    const actions = [
      { key: 'edit', label: 'Edit', onClick: (r) => calls.push(['edit', r]) },
      { key: 'copy', label: 'Copy', onClick: (r) => calls.push(['copy', r]) },
    ]
    const w = mount(TableRowActions, { props: { actions, row }, global: { stubs } })
    const edit = w.findAll('button').find((b) => b.attributes('aria-label') === 'Edit')
    expect(edit).toBeTruthy()
    await edit.trigger('click')
    expect(calls).toEqual([['edit', row]])
  })

  it('hides actions whose visible() predicate is false', () => {
    const actions = [
      { key: 'edit', label: 'Edit', onClick: () => {} },
      { key: 'del', label: 'Delete', visible: () => false, onClick: () => {} },
    ]
    const w = mount(TableRowActions, { props: { actions, row }, global: { stubs } })
    const labels = w.findAll('button').map((b) => b.attributes('aria-label'))
    expect(labels).toContain('Edit')
    expect(labels).not.toContain('Delete')
  })

  it('collapses beyond maxQuick into an overflow menu', async () => {
    const calls = []
    const actions = [
      { key: 'a', label: 'A', onClick: () => calls.push('a') },
      { key: 'b', label: 'B', onClick: () => calls.push('b') },
      { key: 'c', label: 'C', onClick: () => calls.push('c') },
    ]
    const w = mount(TableRowActions, { props: { actions, row, maxQuick: 2 }, global: { stubs } })
    // Two quick (aria-label A/B) + a "More actions" trigger; C lives in the menu.
    expect(w.findAll('button').find((b) => b.attributes('aria-label') === 'More actions')).toBeTruthy()
    const cItem = w.findAll('[role="menuitem"]').find((i) => i.text().includes('C'))
    expect(cItem).toBeTruthy()
    await cItem.trigger('click')
    expect(calls).toEqual(['c'])
  })

  it('respects disabled predicate (no onClick fired)', async () => {
    const calls = []
    const actions = [{ key: 'edit', label: 'Edit', disabled: () => true, onClick: () => calls.push('x') }]
    const w = mount(TableRowActions, { props: { actions, row }, global: { stubs } })
    const edit = w.find('button[aria-label="Edit"]')
    expect(edit.attributes('disabled')).toBeDefined()
    await edit.trigger('click')
    expect(calls).toEqual([])
  })

  it('renders a RouterLink when an action has `to`', () => {
    const actions = [{ key: 'open', label: 'Open', to: (r) => `/x/${r.id}` }]
    const w = mount(TableRowActions, { props: { actions, row }, global: { stubs } })
    const link = w.find('a')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/x/7')
  })
})
