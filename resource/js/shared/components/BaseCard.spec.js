import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseCard from './BaseCard.vue'

describe('BaseCard', () => {
  it('renders a theme-aware card surface (border + radius + bg-card)', () => {
    const w = mount(BaseCard, { slots: { default: 'Body' } })
    const cls = w.classes().join(' ')
    expect(cls).toContain('tw:rounded-xl')
    expect(cls).toContain('tw:border')
    expect(cls).toContain('tw:bg-card')
    expect(w.text()).toContain('Body')
  })

  it('applies the default (md) padding and supports other steps', () => {
    expect(mount(BaseCard).classes().join(' ')).toContain('tw:p-4')
    expect(mount(BaseCard, { props: { padding: 'sm' } }).classes().join(' ')).toContain('tw:p-3')
    expect(mount(BaseCard, { props: { padding: 'lg' } }).classes().join(' ')).toContain('tw:p-6')
  })

  it('applies no padding when padding="none"', () => {
    const cls = mount(BaseCard, { props: { padding: 'none' } }).classes().join(' ')
    expect(cls).not.toContain('tw:p-4')
    expect(cls).not.toContain('tw:p-3')
  })

  it('renders as a custom element via the `as` prop', () => {
    const w = mount(BaseCard, { props: { as: 'section' }, slots: { default: 'x' } })
    expect(w.element.tagName).toBe('SECTION')
  })
})
