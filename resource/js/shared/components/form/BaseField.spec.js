import { describe, it, expect } from 'vitest'
import { h } from 'vue'
import { mount } from '@vue/test-utils'
import BaseField from './BaseField.vue'

// A minimal control that spreads the slot payload (id + a11y attrs) onto a
// native input — exactly how a real Base* control will consume BaseField.
const control = (field) =>
  h('input', {
    'data-test': 'control',
    id: field.id,
    'aria-describedby': field['aria-describedby'],
    'aria-invalid': field['aria-invalid'],
    disabled: field.disabled,
  })

function mountField(props = {}) {
  return mount(BaseField, { props, slots: { default: control } })
}

describe('BaseField', () => {
  it('wires the label to the control via for ↔ id', () => {
    const w = mountField({ label: 'Email' })
    const id = w.find('input').attributes('id')
    expect(id).toBeTruthy()
    expect(w.find('label').attributes('for')).toBe(id)
  })

  it('links a hint via aria-describedby when there is no error', () => {
    const w = mountField({ hint: 'We never share it.' })
    const db = w.find('input').attributes('aria-describedby')
    expect(db).toBeTruthy()
    const hintEl = w.find(`[id="${db}"]`)
    expect(hintEl.exists()).toBe(true)
    expect(hintEl.text()).toContain('We never share it.')
  })

  it('on error: sets aria-invalid and links an alert via aria-describedby', () => {
    const w = mountField({ label: 'Email', error: 'Required' })
    const input = w.find('input')
    expect(input.attributes('aria-invalid')).toBe('true')
    const alert = w.find('[role="alert"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('Required')
    expect(input.attributes('aria-describedby')).toBe(alert.attributes('id'))
  })

  it('error replaces the hint', () => {
    const w = mountField({ hint: 'Hint text', error: 'Boom' })
    expect(w.find('[role="alert"]').exists()).toBe(true)
    expect(w.text()).not.toContain('Hint text')
  })

  it('forwards required to the label asterisk', () => {
    const w = mountField({ label: 'Name', required: true })
    expect(w.find('label').text()).toContain('*')
  })

  it('propagates disabled to the control', () => {
    const w = mountField({ label: 'X', disabled: true })
    expect(w.find('input').attributes('disabled')).toBeDefined()
  })

  it('respects an explicit id override', () => {
    const w = mountField({ label: 'X', id: 'custom-id' })
    expect(w.find('input').attributes('id')).toBe('custom-id')
    expect(w.find('label').attributes('for')).toBe('custom-id')
  })

  it('omits the label when none is provided', () => {
    const w = mountField({ hint: 'just a hint' })
    expect(w.find('label').exists()).toBe(false)
  })
})
