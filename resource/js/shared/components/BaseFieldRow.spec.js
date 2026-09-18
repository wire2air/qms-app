import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseFieldRow from './BaseFieldRow.vue'

describe('BaseFieldRow', () => {
  it('renders a grid wrapping the slotted fields', () => {
    const w = mount(BaseFieldRow, { slots: { default: '<div data-test="f">field</div>' } })
    expect(w.classes()).toContain('tw:grid')
    expect(w.find('[data-test="f"]').exists()).toBe(true)
  })

  it('defaults to a responsive 2-column grid', () => {
    const c = mount(BaseFieldRow).classes().join(' ')
    expect(c).toContain('tw:grid-cols-1')
    expect(c).toContain('tw:sm:grid-cols-2')
  })

  it('renders a single column for columns=1 (no responsive split)', () => {
    const c = mount(BaseFieldRow, { props: { columns: 1 } }).classes().join(' ')
    expect(c).toContain('tw:grid-cols-1')
    expect(c).not.toContain('tw:sm:grid-cols-2')
  })

  it('scales up to 3 columns for columns=3', () => {
    const c = mount(BaseFieldRow, { props: { columns: 3 } }).classes().join(' ')
    expect(c).toContain('tw:lg:grid-cols-3')
  })

  it('uses the comfortable gap by default and a tighter gap when compact', () => {
    expect(mount(BaseFieldRow).classes()).toContain('tw:gap-4')
    expect(mount(BaseFieldRow, { props: { gap: 'compact' } }).classes()).toContain('tw:gap-3')
  })

  it('accepts the columns prop as a string (template literal usage)', () => {
    const c = mount(BaseFieldRow, { props: { columns: '3' } }).classes().join(' ')
    expect(c).toContain('tw:lg:grid-cols-3')
  })
})
