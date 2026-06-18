import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseSelectMenu from './BaseSelectMenu.vue'

const ITEMS = [
  { id: 'a', name: 'Apple' },
  { id: 'b', name: 'Banana' },
  { id: 'c', name: 'Cherry' },
]

let wrapper
afterEach(async () => {
  wrapper?.unmount()
  await nextTick()
  wrapper = null
  document.body.innerHTML = ''
})

// Open with a real #button trigger (required:true hides the nullable row and
// auto-selects the first item, which keeps the trigger slot rendered).
async function openSelect(extraProps = {}) {
  wrapper = mount(BaseSelectMenu, {
    props: { items: ITEMS, required: true, ...extraProps },
    slots: { button: '<button class="trigger">Pick</button>' },
    attachTo: document.body,
  })
  await wrapper.find('.trigger').trigger('click')
  await nextTick()
  await nextTick()
  return wrapper
}

function input() {
  return document.body.querySelector('[role="combobox"]')
}
function options() {
  return [...document.body.querySelectorAll('[role="option"]')]
}

describe('BaseSelectMenu — listbox/combobox a11y', () => {
  it('exposes a combobox search input controlling a listbox', async () => {
    await openSelect()
    const combo = input()
    expect(combo).toBeTruthy()
    const listbox = document.body.querySelector('[role="listbox"]')
    expect(listbox).toBeTruthy()
    expect(combo.getAttribute('aria-controls')).toBe(listbox.id)
  })

  it('renders an option per item with aria-selected reflecting the model', async () => {
    await openSelect()
    const opts = options()
    expect(opts).toHaveLength(3) // no nullable row when required
    // required auto-selects the first item
    expect(opts[0].getAttribute('aria-selected')).toBe('true')
    expect(opts[1].getAttribute('aria-selected')).toBe('false')
  })

  it('ArrowDown moves the active descendant to the next option', async () => {
    await openSelect()
    const combo = input()
    expect(combo.getAttribute('aria-activedescendant')).toBe(options()[0].id)
    combo.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await nextTick()
    expect(combo.getAttribute('aria-activedescendant')).toBe(options()[1].id)
  })

  it('Enter selects the active option', async () => {
    await openSelect()
    const combo = input()
    combo.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await nextTick()
    combo.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await nextTick()
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['b'])
  })

  it('marks the listbox multiselectable in multiple mode', async () => {
    await openSelect({ multiple: true, required: false, modelValue: [] })
    expect(document.body.querySelector('[role="listbox"]').getAttribute('aria-multiselectable')).toBe('true')
  })
})
