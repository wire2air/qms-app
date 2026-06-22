// DetailActionBar.spec.js
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DetailActionBar from './DetailActionBar.vue'

describe('DetailActionBar', () => {
  it('renders visible action buttons and fires onSelect', async () => {
    const onSelect = vi.fn()
    const w = mount(DetailActionBar, {
      props: { actions: [{ id: 'save', label: 'Save', variant: 'primary', priority: 9, onSelect }] },
    })
    const btn = w.get('button')
    expect(btn.text()).toContain('Save')
    await btn.trigger('click')
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('moves overflow actions into a menu when over the cap', () => {
    const w = mount(DetailActionBar, {
      props: {
        maxVisible: 3,
        actions: [
          { id: 'a', label: 'A', priority: 5 },
          { id: 'b', label: 'B', priority: 4 },
          { id: 'c', label: 'C', priority: 3 },
          { id: 'd', label: 'D', priority: 2 },
        ],
      },
      global: { stubs: { BaseMenu: { name: 'BaseMenu', props: ['items'], template: '<div data-test="menu" :data-count="items.length" />' } } },
    })
    // visible = maxVisible - 1 = 2 buttons; overflow = 2 in the menu
    expect(w.findAll('button').length).toBe(2)
    expect(w.get('[data-test="menu"]').attributes('data-count')).toBe('2')
  })

  it('renders nothing when no visible actions', () => {
    const w = mount(DetailActionBar, { props: { actions: [{ id: 'x', label: 'X', visible: false }] } })
    expect(w.find('button').exists()).toBe(false)
  })
  it('passes the action title onto the visible button as a tooltip', () => {
    const w = mount(DetailActionBar, { props: { actions: [{ id: 'x', label: 'Approve', variant: 'primary', priority: 100, disabled: true, title: 'Pick disposition', onSelect() {} }] } })
    const btn = w.get('button')
    expect(btn.attributes('title')).toBe('Pick disposition')
  })
})
