import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TableSearchScope from './TableSearchScope.vue'

// BasePopover is headlessui-gated + teleports, so stub it to render both slots.
const BasePopover = {
  name: 'BasePopover',
  template: `<div><slot name="button" /><slot name="content" /></div>`,
}
const columns = [
  { name: 'a', label: 'Alpha' },
  { name: 'b', label: 'Beta' },
]
function mountScope(modelValue = []) {
  return mount(TableSearchScope, {
    props: { columns, modelValue },
    global: { stubs: { BasePopover } },
  })
}
function itemButton(w, text) {
  return w.findAll('button').find((b) => b.text().includes(text) && b.attributes('role'))
}

describe('TableSearchScope', () => {
  it('shows "All fields" by default', () => {
    expect(mountScope().text()).toContain('All fields')
  })

  it('selecting a column emits that column name', async () => {
    const w = mountScope()
    await itemButton(w, 'Alpha').trigger('click')
    expect(w.emitted('update:modelValue').at(-1)[0]).toEqual(['a'])
  })

  it('toggling a selected column removes it', async () => {
    const w = mountScope(['a'])
    await itemButton(w, 'Alpha').trigger('click')
    expect(w.emitted('update:modelValue').at(-1)[0]).toEqual([])
  })

  it('"All fields" clears the scope', async () => {
    const w = mountScope(['a', 'b'])
    await itemButton(w, 'All fields').trigger('click')
    expect(w.emitted('update:modelValue').at(-1)[0]).toEqual([])
  })

  it('labels the trigger with the single selected column', () => {
    expect(mountScope(['b']).text()).toContain('Beta')
  })

  it('labels the trigger with a count when several are selected', () => {
    expect(mountScope(['a', 'b']).text()).toContain('2 columns')
  })
})
