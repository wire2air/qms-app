import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseBadge from './BaseBadge.vue'

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
