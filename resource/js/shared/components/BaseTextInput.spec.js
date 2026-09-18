import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseTextInput from './BaseTextInput.vue'

describe('BaseTextInput', () => {
  it('binds value and emits update:modelValue via defineModel', async () => {
    const w = mount(BaseTextInput, { props: { modelValue: 'a' } })
    const input = w.find('input')
    expect(input.element.value).toBe('a')
    await input.setValue('b')
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['b'])
  })

  it('pairs the label `for` with the input `id` (falls back to name)', () => {
    const w = mount(BaseTextInput, { props: { label: 'Email', name: 'email' } })
    const id = w.find('input').attributes('id')
    expect(id).toBe('email')
    expect(w.find('label').attributes('for')).toBe('email')
  })

  it('generates an id when neither id nor name is given', () => {
    const w = mount(BaseTextInput, { props: { label: 'X' } })
    const id = w.find('input').attributes('id')
    expect(id).toBeTruthy()
    expect(w.find('label').attributes('for')).toBe(id)
  })

  it('an explicit id prop wins (BaseField wiring)', () => {
    const w = mount(BaseTextInput, { props: { label: 'X', name: 'n', id: 'field-1' } })
    expect(w.find('input').attributes('id')).toBe('field-1')
    expect(w.find('label').attributes('for')).toBe('field-1')
  })

  it('wires aria-invalid + aria-describedby to an alert on errorMsg', () => {
    const w = mount(BaseTextInput, { props: { name: 'f', errorMsg: 'Required' } })
    const input = w.find('input')
    expect(input.attributes('aria-invalid')).toBe('true')
    const err = w.find('[role="alert"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('Required')
    expect(input.attributes('aria-describedby')).toBe(err.attributes('id'))
  })

  it('has no aria-invalid when there is no error', () => {
    const w = mount(BaseTextInput, { props: { name: 'f' } })
    expect(w.find('input').attributes('aria-invalid')).toBeUndefined()
  })
})
