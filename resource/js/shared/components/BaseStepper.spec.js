import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseStepper from './BaseStepper.vue'

const STEPS = [
  { title: 'Draft' },
  { title: 'Review' },
  { title: 'Approved' },
]

describe('BaseStepper (rule #8 + stepper a11y)', () => {
  it('renders an ordered list with an accessible name', () => {
    const w = mount(BaseStepper, { props: { steps: STEPS, modelValue: 1, ariaLabel: 'Approval progress' } })
    const ol = w.find('ol')
    expect(ol.exists()).toBe(true)
    expect(ol.attributes('aria-label')).toBe('Approval progress')
  })

  it('marks the current step with aria-current="step"', () => {
    const w = mount(BaseStepper, { props: { steps: STEPS, modelValue: 1 } })
    const current = w.findAll('li').filter((li) => li.attributes('aria-current') === 'step')
    expect(current).toHaveLength(1)
    expect(current[0].text()).toContain('Review')
  })

  it('connectors are hidden from assistive tech', () => {
    const w = mount(BaseStepper, { props: { steps: STEPS, modelValue: 0 } })
    // 3 steps → 2 decorative connector <li>s, each aria-hidden
    expect(w.findAll('li[aria-hidden="true"]')).toHaveLength(2)
  })

  it('is NOT keyboard-interactive when not clickable (no buttons)', () => {
    const w = mount(BaseStepper, { props: { steps: STEPS, modelValue: 0 } })
    expect(w.findAll('button')).toHaveLength(0)
  })

  it('renders clickable steps as real <button>s and selects on activation', async () => {
    const w = mount(BaseStepper, {
      props: { steps: STEPS, modelValue: 0, clickable: true, 'onUpdate:modelValue': () => {} },
    })
    const buttons = w.findAll('button')
    expect(buttons.length).toBe(3)
    await buttons[2].trigger('click')
    expect(w.emitted('stepClick').at(-1)).toEqual([2])
    expect(w.emitted('update:modelValue').at(-1)).toEqual([2])
  })

  it('disables a clickable step that is marked disabled', () => {
    const steps = [{ title: 'A' }, { title: 'B', disabled: true }, { title: 'C' }]
    const w = mount(BaseStepper, { props: { steps, modelValue: 0, clickable: true } })
    expect(w.findAll('button')[1].element.disabled).toBe(true)
  })
})
