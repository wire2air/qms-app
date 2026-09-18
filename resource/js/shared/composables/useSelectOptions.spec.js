import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useSelectOptions } from './useSelectOptions.js'

const OPTIONS = [
  { id: 'a', name: 'Apple', kind: 'fruit' },
  { id: 'b', name: 'Banana', kind: 'fruit' },
  { id: 'c', name: 'Carrot', kind: 'veg', off: true },
]

function setup(overrides = {}, modelValue = null) {
  const props = {
    options: OPTIONS,
    optionLabel: 'name',
    optionValue: 'id',
    optionDisabled: 'off',
    optionGroup: null,
    optionIcon: null,
    optionAvatar: null,
    optionDescription: null,
    emitValue: true,
    multiple: false,
    ...overrides,
  }
  const model = ref(modelValue)
  return { ...useSelectOptions(props, model), model, props }
}

describe('useSelectOptions', () => {
  it('normalizes options via key accessors', () => {
    const { normalizedOptions } = setup()
    expect(normalizedOptions.value).toHaveLength(3)
    expect(normalizedOptions.value[0]).toMatchObject({ label: 'Apple', value: 'a', disabled: false })
    expect(normalizedOptions.value[2].disabled).toBe(true)
  })

  it('supports function accessors', () => {
    const { normalizedOptions } = setup({
      optionLabel: (o) => `${o.name}!`,
      optionValue: (o) => o.id.toUpperCase(),
    })
    expect(normalizedOptions.value[0].label).toBe('Apple!')
    expect(normalizedOptions.value[0].value).toBe('A')
  })

  it('handles primitive options', () => {
    const { normalizedOptions } = setup({ options: ['x', 'y'], optionLabel: 'label', optionValue: 'value' })
    expect(normalizedOptions.value[0]).toMatchObject({ label: 'x', value: 'x' })
  })

  it('resolves single selection from emitValue model', () => {
    const { selectedOptions, isSelected, normalizedOptions } = setup({}, 'b')
    expect(selectedOptions.value.map((o) => o.value)).toEqual(['b'])
    expect(isSelected(normalizedOptions.value[1])).toBe(true)
    expect(isSelected(normalizedOptions.value[0])).toBe(false)
  })

  it('resolves multiple selection in model order', () => {
    const { selectedOptions } = setup({ multiple: true }, ['c', 'a'])
    expect(selectedOptions.value.map((o) => o.value)).toEqual(['c', 'a'])
  })

  it('resolves selection when emitValue is false (object model)', () => {
    const { isSelected, normalizedOptions } = setup({ emitValue: false }, OPTIONS[0])
    expect(isSelected(normalizedOptions.value[0])).toBe(true)
  })

  it('toEmitted honors emitValue', () => {
    const withValue = setup({ emitValue: true })
    expect(withValue.toEmitted(withValue.normalizedOptions.value[0])).toBe('a')
    const withObject = setup({ emitValue: false })
    expect(withObject.toEmitted(withObject.normalizedOptions.value[0])).toEqual(OPTIONS[0])
  })

  it('groups options preserving first-seen order', () => {
    const { groupedOptions, isGrouped } = setup({ optionGroup: 'kind' })
    expect(isGrouped.value).toBe(true)
    expect([...groupedOptions.value.keys()]).toEqual(['fruit', 'veg'])
    expect(groupedOptions.value.get('fruit')).toHaveLength(2)
  })
})
