import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import BaseSwitcher from './BaseSwitcher.vue'

const Grid = () => h('svg', { 'data-icon': 'grid' })
const List = () => h('svg', { 'data-icon': 'list' })
const SWITCHES = [
  { icon: Grid, value: 'grid', tooltip: 'Grid view' },
  { icon: List, value: 'list', tooltip: 'List view' },
]

function mountSwitcher(modelValue = 'grid') {
  return mount(BaseSwitcher, {
    props: { switches: SWITCHES, modelValue, ariaLabel: 'View', 'onUpdate:modelValue': () => {} },
  })
}

describe('BaseSwitcher (rule #8: radiogroup keyboard/ARIA)', () => {
  it('exposes a radiogroup with an accessible name', () => {
    const group = mountSwitcher().find('[role="radiogroup"]')
    expect(group.exists()).toBe(true)
    expect(group.attributes('aria-label')).toBe('View')
  })

  it('renders each switch as a role=radio button (not a clickable icon)', () => {
    const radios = mountSwitcher().findAll('button[role="radio"]')
    expect(radios).toHaveLength(2)
    expect(radios[0].attributes('type')).toBe('button')
  })

  it('marks the selected switch with aria-checked', () => {
    const radios = mountSwitcher('list').findAll('button[role="radio"]')
    expect(radios[0].attributes('aria-checked')).toBe('false')
    expect(radios[1].attributes('aria-checked')).toBe('true')
  })

  it('gives each radio an accessible name from its tooltip', () => {
    const radios = mountSwitcher().findAll('button[role="radio"]')
    expect(radios[0].attributes('aria-label')).toBe('Grid view')
  })

  it('uses roving tabindex (selected = 0, others = -1)', () => {
    const radios = mountSwitcher('grid').findAll('button[role="radio"]')
    expect(radios[0].attributes('tabindex')).toBe('0')
    expect(radios[1].attributes('tabindex')).toBe('-1')
  })

  it('selects on click', async () => {
    const w = mountSwitcher('grid')
    await w.findAll('button[role="radio"]')[1].trigger('click')
    expect(w.emitted('update:modelValue').at(-1)).toEqual(['list'])
  })

  it('ArrowRight moves selection to the next switch', async () => {
    const w = mountSwitcher('grid')
    await w.find('[role="radiogroup"]').trigger('keydown', { key: 'ArrowRight' })
    expect(w.emitted('update:modelValue').at(-1)).toEqual(['list'])
  })

  it('ArrowLeft wraps from the first to the last', async () => {
    const w = mountSwitcher('grid')
    await w.find('[role="radiogroup"]').trigger('keydown', { key: 'ArrowLeft' })
    expect(w.emitted('update:modelValue').at(-1)).toEqual(['list'])
  })

  it('does not use the cursor-pointer! important override', () => {
    expect(mountSwitcher().html()).not.toContain('cursor-pointer!')
  })
})
