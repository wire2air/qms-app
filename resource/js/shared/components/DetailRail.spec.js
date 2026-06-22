import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DetailRail from './DetailRail.vue'

describe('DetailRail', () => {
  it('renders the default slot when provided (slot wins)', () => {
    const w = mount(DetailRail, {
      props: { railCards: [{ id: 'p', title: 'Properties', items: [{ label: 'Owner', value: 'Jane' }] }] },
      slots: { default: '<div data-test="slot">custom</div>' },
    })
    expect(w.find('[data-test="slot"]').exists()).toBe(true)
    expect(w.text()).not.toContain('Owner')
  })

  it('renders railCards descriptors when no slot', () => {
    const w = mount(DetailRail, {
      props: { railCards: [{ id: 'p', title: 'Properties', items: [{ label: 'Owner', value: 'Jane' }] }] },
    })
    expect(w.text()).toContain('Properties')
    expect(w.text()).toContain('Owner')
    expect(w.text()).toContain('Jane')
  })

  it('uses an aside landmark labelled Details', () => {
    const w = mount(DetailRail, { props: { railCards: [] }, slots: { default: '<div/>' } })
    const aside = w.get('aside')
    expect(aside.attributes('aria-label')).toBe('Details')
  })
})
