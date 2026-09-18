import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import PageSection from './PageSection.vue'

const StubIcon = { name: 'StubIcon', render: () => h('svg', { 'data-icon': 'true' }) }

describe('PageSection', () => {
  it('renders the title in an h2 heading by default', () => {
    const w = mount(PageSection, { props: { title: 'Members' } })
    const h2 = w.find('h2')
    expect(h2.exists()).toBe(true)
    expect(h2.text()).toContain('Members')
  })

  it('renders the body slot', () => {
    const w = mount(PageSection, {
      props: { title: 'X' },
      slots: { default: '<div data-test="body">content</div>' },
    })
    expect(w.find('[data-test="body"]').exists()).toBe(true)
  })

  it('forwards the icon and actions slot to the header', () => {
    const w = mount(PageSection, {
      props: { title: 'X', icon: StubIcon },
      slots: { actions: '<button data-test="action">Add</button>' },
    })
    expect(w.find('[data-icon]').exists()).toBe(true)
    expect(w.find('[data-test="action"]').exists()).toBe(true)
  })

  it('omits the header entirely when no title, icon, or header slots are given', () => {
    const w = mount(PageSection, { slots: { default: '<p>just a body</p>' } })
    expect(w.find('h2').exists()).toBe(false)
  })

  it('applies the card surface only for the card variant', () => {
    const plain = mount(PageSection, { props: { title: 'X' } }).find('section')
    expect(plain.classes()).not.toContain('tw:bg-card')
    const card = mount(PageSection, { props: { title: 'X', variant: 'card' } }).find('section')
    expect(card.classes()).toContain('tw:bg-card')
    expect(card.classes()).toContain('tw:border')
  })
})
