import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ContentGrid from './ContentGrid.vue'

describe('ContentGrid', () => {
  it('renders slotted items', () => {
    const w = mount(ContentGrid, {
      slots: { default: '<div data-test="item">a</div><div data-test="item">b</div>' },
    })
    expect(w.findAll('[data-test="item"]')).toHaveLength(2)
  })

  it('sets an auto-fill grid template using the min prop, guarded by min(100%, …)', () => {
    const style = mount(ContentGrid, { props: { min: '18rem' } }).find('div').attributes('style')
    expect(style).toContain('repeat(auto-fill')
    expect(style).toContain('minmax(min(100%, 18rem), 1fr)')
  })

  it('defaults the min to 16rem', () => {
    const style = mount(ContentGrid).find('div').attributes('style')
    expect(style).toContain('16rem')
  })

  it('applies the comfortable gap by default and a compact gap when requested', () => {
    expect(mount(ContentGrid).find('div').classes()).toContain('tw:gap-4')
    expect(mount(ContentGrid, { props: { gap: 'compact' } }).find('div').classes()).toContain(
      'tw:gap-2',
    )
  })
})
