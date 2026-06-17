import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseHeading from './BaseHeading.vue'
import BaseText from './BaseText.vue'
import BaseCaption from './BaseCaption.vue'
import BaseLabel from './BaseLabel.vue'
import BaseHelperText from './BaseHelperText.vue'
import BaseErrorText from './BaseErrorText.vue'

// The thin wrappers (Caption/Helper/Error) and BaseLabel's description render
// <BaseText> internally; register it globally so they resolve in isolation.
const global = { components: { BaseText } }

describe('BaseHeading', () => {
  it('maps level to the matching semantic tag', () => {
    expect(mount(BaseHeading, { props: { level: 1 }, slots: { default: 'X' } }).find('h1').exists()).toBe(true)
    expect(mount(BaseHeading, { props: { level: 3 }, slots: { default: 'X' } }).find('h3').exists()).toBe(true)
  })

  it('keeps the semantic tag from `level` while `as` changes only the visual size', () => {
    const w = mount(BaseHeading, { props: { level: 2, as: 'page-title' }, slots: { default: 'X' } })
    expect(w.find('h2').exists()).toBe(true) // structure from level
    expect(w.html()).toContain('tw:text-page-title') // visual from `as`
  })

  it('uses a wired size token, never a raw px class', () => {
    const html = mount(BaseHeading, { props: { level: 1 }, slots: { default: 'X' } }).html()
    expect(html).toContain('tw:text-page-title')
    expect(html).not.toMatch(/text-\[\d+px\]/)
  })
})

describe('BaseText', () => {
  it('defaults to the body variant on a <p>', () => {
    const w = mount(BaseText, { slots: { default: 'hi' } })
    expect(w.find('p').exists()).toBe(true)
    expect(w.html()).toContain('tw:text-body')
  })

  it('honors color + weight overrides via the token map', () => {
    const w = mount(BaseText, { props: { color: 'primary', weight: 'bold' }, slots: { default: 'x' } })
    expect(w.html()).toContain('tw:text-primary')
    expect(w.html()).toContain('tw:font-bold')
  })

  it('clamps to N lines via the explicit map', () => {
    expect(mount(BaseText, { props: { lines: 2 }, slots: { default: 'x' } }).html()).toContain('tw:line-clamp-2')
  })
})

describe('BaseLabel', () => {
  it('renders a <label> wired to its control via `for`', () => {
    const w = mount(BaseLabel, { props: { for: 'email' }, slots: { default: 'Email' }, global })
    const label = w.find('label')
    expect(label.exists()).toBe(true)
    expect(label.attributes('for')).toBe('email')
  })

  it('shows a decorative (aria-hidden) required asterisk', () => {
    const w = mount(BaseLabel, { props: { required: true }, slots: { default: 'Name' }, global })
    expect(w.find('[aria-hidden="true"]').exists()).toBe(true)
    expect(w.text()).toContain('*')
  })

  it('shows an "(optional)" hint instead', () => {
    const w = mount(BaseLabel, { props: { optional: true }, slots: { default: 'Name' }, global })
    expect(w.text()).toContain('(optional)')
  })

  it('uses the size token, not a raw font size', () => {
    const w = mount(BaseLabel, { props: { size: 'md' }, slots: { default: 'X' }, global })
    expect(w.find('label').classes()).toContain('tw:text-body')
    expect(w.html()).not.toMatch(/text-\[\d+px\]/)
  })

  it('applies disabled color + cursor', () => {
    const w = mount(BaseLabel, { props: { disabled: true }, slots: { default: 'X' }, global })
    const c = w.find('label').classes()
    expect(c).toContain('tw:text-placeholder')
    expect(c).toContain('tw:cursor-not-allowed')
  })

  it('error state overrides the color', () => {
    const w = mount(BaseLabel, { props: { error: true }, slots: { default: 'X' }, global })
    expect(w.find('label').classes()).toContain('tw:text-bad')
  })

  it('renders a description subtitle', () => {
    const w = mount(BaseLabel, { props: { description: 'Helpful note' }, slots: { default: 'X' }, global })
    expect(w.text()).toContain('Helpful note')
  })
})

describe('BaseErrorText', () => {
  it('is an assertive live region for screen readers', () => {
    const w = mount(BaseErrorText, { slots: { default: 'Required' }, global })
    expect(w.attributes('role')).toBe('alert')
    expect(w.text()).toContain('Required')
  })
})

describe('BaseCaption / BaseHelperText', () => {
  it('caption uses the caption token + secondary color', () => {
    const html = mount(BaseCaption, { slots: { default: 'ts' }, global }).html()
    expect(html).toContain('tw:text-caption')
    expect(html).toContain('tw:text-secondary')
  })

  it('helper forwards an id for aria-describedby wiring', () => {
    const w = mount(BaseHelperText, { attrs: { id: 'pw-hint' }, slots: { default: 'min 8 chars' }, global })
    expect(w.attributes('id')).toBe('pw-hint')
  })
})
