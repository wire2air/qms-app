import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DetailHeader from './DetailHeader.vue'

describe('DetailHeader', () => {
  it('renders title, status slot, and meta slot in full variant', () => {
    const w = mount(DetailHeader, {
      props: { title: 'Acme Corp', variant: 'full' },
      slots: { status: '<span data-test="st">Active</span>', meta: '<span data-test="mt">code · 2d</span>' },
    })
    expect(w.text()).toContain('Acme Corp')
    expect(w.find('[data-test="st"]').exists()).toBe(true)
    expect(w.find('[data-test="mt"]').exists()).toBe(true)
  })

  it('compact variant hides the meta slot', () => {
    const w = mount(DetailHeader, {
      props: { title: 'Acme Corp', variant: 'compact' },
      slots: { meta: '<span data-test="mt">x</span>' },
    })
    expect(w.find('[data-test="mt"]').exists()).toBe(false)
  })

  it('renders the action bar from the actions prop', () => {
    const w = mount(DetailHeader, {
      props: { title: 'X', actions: [{ id: 'a', label: 'Approve', variant: 'primary', priority: 9, onSelect() {} }] },
    })
    expect(w.text()).toContain('Approve')
  })

  it('applies a bottom border when scrolled', () => {
    const w = mount(DetailHeader, { props: { title: 'X', scrolled: true } })
    expect(w.get('header').classes().join(' ')).toContain('tw:border-b')
  })
})
