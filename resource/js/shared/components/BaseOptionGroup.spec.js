import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseOptionGroup from './BaseOptionGroup.vue'

const objOpts = [
  { label: 'Apple', value: 'apple' },
  { label: 'Banana', value: 'banana' },
  { label: 'Cherry', value: 'cherry' },
]
const userOpts = [
  { id: 'u1', name: 'Jane' },
  { id: 'u2', name: 'Sam' },
]

// Mount with a self-syncing v-model so multi-step interactions see updated state.
function mountModel(props) {
  const wrapper = mount(BaseOptionGroup, {
    props: { 'onUpdate:modelValue': (e) => wrapper.setProps({ modelValue: e }), ...props },
  })
  return wrapper
}

describe('BaseOptionGroup', () => {
  it('renders one input per option and the labels', () => {
    const w = mount(BaseOptionGroup, { props: { options: objOpts, type: 'radio' } })
    const inputs = w.findAll('input')
    expect(inputs).toHaveLength(3)
    expect(inputs.every((i) => i.attributes('type') === 'radio')).toBe(true)
    expect(w.text()).toContain('Apple')
    expect(w.text()).toContain('Cherry')
  })

  it('radio: clicking emits the single value', async () => {
    const w = mount(BaseOptionGroup, {
      props: { modelValue: 'banana', options: objOpts, type: 'radio' },
    })
    await w.findAll('input')[2].trigger('change') // Cherry
    expect(w.emitted('update:modelValue')).toBeTruthy()
    expect(w.emitted('update:modelValue').at(-1)).toEqual(['cherry'])
  })

  it('radio reflects modelValue as checked', () => {
    const w = mount(BaseOptionGroup, {
      props: { modelValue: 'banana', options: objOpts, type: 'radio' },
    })
    const inputs = w.findAll('input')
    expect(inputs.map((i) => i.element.checked)).toEqual([false, true, false])
  })

  it('FUNCTION resolvers: clicking emits the resolved id (the bug that broke)', async () => {
    const w = mount(BaseOptionGroup, {
      props: {
        modelValue: null,
        options: userOpts,
        type: 'radio',
        optionValue: (o) => o.id,
        optionLabel: (o) => o.name,
      },
    })
    expect(w.text()).toContain('Jane')
    await w.findAll('input')[1].trigger('change')
    expect(w.emitted('update:modelValue').at(-1)).toEqual(['u2'])
  })

  it('string options work', async () => {
    const w = mount(BaseOptionGroup, {
      props: { modelValue: null, options: ['Small', 'Medium', 'Large'], type: 'radio' },
    })
    await w.findAll('input')[1].trigger('change')
    expect(w.emitted('update:modelValue').at(-1)).toEqual(['Medium'])
  })

  it('checkbox: renders checkbox inputs and toggles add/remove on the array', async () => {
    const w = mountModel({ modelValue: ['apple'], options: objOpts, type: 'checkbox' })
    expect(w.findAll('input').every((i) => i.attributes('type') === 'checkbox')).toBe(true)

    await w.findAll('input')[1].trigger('change') // add Banana
    expect(w.props('modelValue')).toEqual(['apple', 'banana'])

    await w.findAll('input')[0].trigger('change') // remove Apple
    expect(w.props('modelValue')).toEqual(['banana'])
  })

  it('checkbox: normalises a non-array model to an array on mount', () => {
    const undef = mount(BaseOptionGroup, { props: { options: objOpts, type: 'checkbox' } })
    expect(undef.emitted('update:modelValue').at(-1)).toEqual([[]])

    const scalar = mount(BaseOptionGroup, {
      props: { modelValue: 'apple', options: objOpts, type: 'checkbox' },
    })
    expect(scalar.emitted('update:modelValue').at(-1)).toEqual([['apple']])
  })

  it('disabled: inputs are disabled and clicks emit nothing', async () => {
    const w = mount(BaseOptionGroup, {
      props: { modelValue: 'apple', options: objOpts, type: 'radio', disabled: true },
    })
    expect(w.findAll('input').every((i) => i.element.disabled)).toBe(true)
    await w.findAll('input')[1].trigger('change')
    expect(w.emitted('update:modelValue')).toBeFalsy()
  })

  it('readonly: blocks selection too', async () => {
    const w = mount(BaseOptionGroup, {
      props: { modelValue: 'apple', options: objOpts, type: 'radio', readonly: true },
    })
    await w.findAll('input')[1].trigger('change')
    expect(w.emitted('update:modelValue')).toBeFalsy()
  })

  it('renders the label and help text', () => {
    const w = mount(BaseOptionGroup, {
      props: { options: objOpts, label: 'Fruit', instructions: 'Pick one' },
    })
    expect(w.text()).toContain('Fruit')
    expect(w.text()).toContain('Pick one')
  })
})
