import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseRadio from './BaseRadio.vue'

describe('BaseRadio', () => {
  it('renders a radio input carrying name + value', () => {
    const w = mount(BaseRadio, { props: { value: 'a', name: 'group', label: 'Option A' } })
    const input = w.find('input')
    expect(input.attributes('type')).toBe('radio')
    expect(input.attributes('name')).toBe('group')
    expect(w.text()).toContain('Option A')
  })

  it('is checked when the model equals its value', () => {
    const w = mount(BaseRadio, { props: { value: 'a', modelValue: 'a' } })
    expect(w.find('input').element.checked).toBe(true)
    const w2 = mount(BaseRadio, { props: { value: 'a', modelValue: 'b' } })
    expect(w2.find('input').element.checked).toBe(false)
  })

  it('selects its value on change', async () => {
    const w = mount(BaseRadio, { props: { value: 'a', modelValue: null } })
    await w.find('input').trigger('change')
    expect(w.emitted('update:modelValue').at(-1)).toEqual(['a'])
  })

  it('uses the hidden-input + peer-focus pattern (input is sr-only)', () => {
    const w = mount(BaseRadio, { props: { value: 'a' } })
    expect(w.find('input').classes()).toContain('tw:sr-only')
    expect(w.find('input').classes()).toContain('tw:peer')
  })

  it('disables the native input when disabled', () => {
    const w = mount(BaseRadio, { props: { value: 'a', disabled: true } })
    expect(w.find('input').element.disabled).toBe(true)
  })

  it('renders the default slot over the label prop', () => {
    const w = mount(BaseRadio, { props: { value: 'a', label: 'ignored' }, slots: { default: 'Custom' } })
    expect(w.text()).toContain('Custom')
    expect(w.text()).not.toContain('ignored')
  })
})
