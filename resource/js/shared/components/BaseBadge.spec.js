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

describe('BaseBadge — size (folded in from BaseChip)', () => {
  it('applies md metrics when size="md"', () => {
    const cls = mount(BaseBadge, { props: { size: 'md' }, slots: { default: 'X' } }).classes().join(' ')
    expect(cls).toContain('tw:px-3')
    expect(cls).toContain('tw:text-sm')
  })

  it('applies tighter metrics at size="sm"', () => {
    const cls = mount(BaseBadge, { props: { size: 'sm' }, slots: { default: 'X' } }).classes().join(' ')
    expect(cls).toContain('tw:px-2')
    expect(cls).toContain('tw:text-xs')
  })
})

describe('BaseBadge — select-trigger dark-mode fill', () => {
  // Since `refactor(ds): merge BaseChip into BaseBadge` (3ff14cb0) a plain
  // selectable badge is a GHOST trigger: no pill wrapper at all, so it reads as
  // the value rather than as another chip. The theme-aware half of the original
  // claim is what survives — `tw:text-on-main` is still the dark-mode fix
  // (3d5c1620); the `bg-main-hover`/`border-divider` fill it used to pair with
  // is gone by design, along with the border.
  it('a plain (no-scheme) selectable trigger renders as a theme-aware ghost trigger', () => {
    const w = mount(BaseBadge, { props: { selectable: true }, slots: { default: 'San Jose' } })
    const cls = w.classes()
    expect(cls).toContain('tw:text-on-main') // theme-aware text (white in dark)
    expect(cls).not.toContain('tw:border-current/20') // no pill border
    expect(cls).not.toContain('tw:bg-main-hover') // no pill fill
    expect(cls).not.toContain('tw:rounded-md')
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
