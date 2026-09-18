import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BasePage from './BasePage.vue'

describe('BasePage', () => {
  it('renders default slot content', () => {
    const w = mount(BasePage, { slots: { default: '<p data-test="body">Hi</p>' } })
    expect(w.find('[data-test="body"]').exists()).toBe(true)
  })

  it('centers and applies the standard max-width by default', () => {
    const root = mount(BasePage).find('div')
    expect(root.classes()).toContain('tw:mx-auto')
    expect(root.classes()).toContain('tw:max-w-7xl')
  })

  it('applies the wide, narrow, and full width tiers', () => {
    expect(mount(BasePage, { props: { width: 'wide' } }).find('div').classes()).toContain(
      'tw:max-w-[96rem]',
    )
    expect(mount(BasePage, { props: { width: 'narrow' } }).find('div').classes()).toContain(
      'tw:max-w-3xl',
    )
    expect(mount(BasePage, { props: { width: 'full' } }).find('div').classes()).toContain(
      'tw:max-w-none',
    )
  })

  it('applies responsive horizontal padding by default and omits it when not padded', () => {
    expect(mount(BasePage).find('div').classes()).toContain('tw:px-4')
    expect(mount(BasePage, { props: { padded: false } }).find('div').classes()).not.toContain(
      'tw:px-4',
    )
  })

  it('uses a comfortable section gap by default and a compact gap when requested', () => {
    expect(mount(BasePage).find('div').classes()).toContain('tw:gap-6')
    expect(mount(BasePage, { props: { density: 'compact' } }).find('div').classes()).toContain(
      'tw:gap-4',
    )
  })

  it('becomes a full-height flex column when fullHeight is set', () => {
    const root = mount(BasePage, { props: { fullHeight: true } }).find('div')
    expect(root.classes()).toContain('tw:h-full')
    expect(root.classes()).toContain('tw:min-h-0')
    expect(mount(BasePage).find('div').classes()).not.toContain('tw:h-full')
  })
})
