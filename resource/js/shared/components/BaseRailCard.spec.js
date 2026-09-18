import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseRailCard from './BaseRailCard.vue'

describe('BaseRailCard', () => {
  it('renders title and body', () => {
    const w = mount(BaseRailCard, { props: { title: 'Properties' }, slots: { default: '<p>x</p>' } })
    expect(w.text()).toContain('Properties')
    expect(w.text()).toContain('x')
  })

  it('toggle button has aria-expanded and hides body when collapsed', async () => {
    const w = mount(BaseRailCard, { props: { title: 'Properties' }, slots: { default: '<p data-test="b">x</p>' } })
    const btn = w.get('button')
    expect(btn.attributes('aria-expanded')).toBe('true')
    await btn.trigger('click')
    expect(btn.attributes('aria-expanded')).toBe('false')
    expect(w.find('[data-test="b"]').exists()).toBe(false)
  })

  it('non-collapsible renders title as heading, no button', () => {
    const w = mount(BaseRailCard, { props: { title: 'Properties', collapsible: false }, slots: { default: '<p/>' } })
    expect(w.find('button').exists()).toBe(false)
    expect(w.find('h3').exists()).toBe(true)
  })
})
