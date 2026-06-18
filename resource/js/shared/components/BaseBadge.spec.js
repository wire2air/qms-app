import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseBadge from './BaseBadge.vue'

describe('BaseBadge — clearable (rule #8: keyboard-operable remove)', () => {
  it('renders the clear affordance as a real <button> with an accessible name', () => {
    const w = mount(BaseBadge, { props: { clearable: true }, slots: { default: 'San Jose' } })
    const btn = w.find('button')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('type')).toBe('button')
    expect(btn.attributes('aria-label')).toBe('Remove')
  })

  it('uses a custom clearLabel for the accessible name', () => {
    const w = mount(BaseBadge, {
      props: { clearable: true, clearLabel: 'Remove San Jose' },
      slots: { default: 'San Jose' },
    })
    expect(w.find('button').attributes('aria-label')).toBe('Remove San Jose')
  })

  it('emits clear when the clear button is activated (click / native Enter+Space)', async () => {
    const w = mount(BaseBadge, { props: { clearable: true }, slots: { default: 'San Jose' } })
    await w.find('button').trigger('click')
    expect(w.emitted('clear')).toHaveLength(1)
  })

  it('renders no clear button when not clearable', () => {
    const w = mount(BaseBadge, { slots: { default: 'Active' } })
    expect(w.find('button').exists()).toBe(false)
  })
})

describe('BaseBadge — select-trigger dark-mode fill', () => {
  it('a plain (no-scheme) selectable trigger gets a theme-aware control fill', () => {
    const w = mount(BaseBadge, { props: { selectable: true }, slots: { default: 'San Jose' } })
    const cls = w.classes()
    expect(cls).toContain('tw:bg-main-hover')
    expect(cls).toContain('tw:border-divider')
    expect(cls).toContain('tw:text-on-main') // theme-aware text (white in dark)
    expect(cls).not.toContain('tw:border-current/20')
  })

  it('a scheme-colored selectable trigger keeps its color (no control fill)', () => {
    const w = mount(BaseBadge, {
      props: { selectable: true },
      attrs: { class: 'tw:bg-green-100 tw:text-green-700' },
      slots: { default: 'Approved' },
    })
    const cls = w.classes()
    expect(cls).not.toContain('tw:bg-main-hover')
    expect(cls).toContain('tw:border-current/20')
    expect(cls).toContain('tw:bg-green-100') // scheme color preserved
  })

  it('a non-selectable display badge is unchanged (no control fill)', () => {
    const w = mount(BaseBadge, { slots: { default: 'Active' } })
    const cls = w.classes()
    expect(cls).not.toContain('tw:bg-main-hover')
    expect(cls).toContain('tw:border-current/20')
  })
})
