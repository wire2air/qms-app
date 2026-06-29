import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseSelect from './BaseSelect.vue'

const OPTIONS = [
  { id: 'a', name: 'Apple' },
  { id: 'b', name: 'Banana' },
  { id: 'c', name: 'Cherry', off: true },
]

let wrapper
afterEach(async () => {
  wrapper?.unmount()
  await nextTick()
  wrapper = null
  document.body.innerHTML = ''
})

async function open(props = {}) {
  wrapper = mount(BaseSelect, {
    props: { options: OPTIONS, optionLabel: 'name', optionValue: 'id', ...props },
    attachTo: document.body,
  })
  await wrapper.get('[aria-haspopup="listbox"]').trigger('click')
  await nextTick()
  await nextTick()
  return wrapper
}

function options() {
  return [...document.body.querySelectorAll('[role="option"]')]
}

describe('BaseSelect', () => {
  it('shows the placeholder when nothing is selected', () => {
    wrapper = mount(BaseSelect, {
      props: { options: OPTIONS, optionLabel: 'name', optionValue: 'id', placeholder: 'Pick one' },
    })
    expect(wrapper.text()).toContain('Pick one')
  })

  it('opens a listbox of options', async () => {
    await open()
    expect(options()).toHaveLength(3)
    expect(options()[0].textContent).toContain('Apple')
  })

  it('emits the option value on single select', async () => {
    await open()
    options()[1].click()
    await nextTick()
    expect(wrapper.emitted()['update:modelValue'].at(-1)).toEqual(['b'])
  })

  it('emits the whole object when emitValue is false', async () => {
    await open({ emitValue: false })
    options()[0].click()
    await nextTick()
    expect(wrapper.emitted()['update:modelValue'].at(-1)).toEqual([OPTIONS[0]])
  })

  it('does not select a disabled option', async () => {
    await open({ optionDisabled: 'off' })
    expect(options()[2].getAttribute('aria-disabled')).toBe('true')
    options()[2].click()
    await nextTick()
    expect(wrapper.emitted()['update:modelValue']).toBeUndefined()
  })

  it('toggles values in multiple mode without closing', async () => {
    await open({ multiple: true, modelValue: [] })
    options()[0].click()
    await nextTick()
    expect(wrapper.emitted()['update:modelValue'].at(-1)).toEqual([['a']])
    // panel still open
    expect(options().length).toBe(3)
  })

  it('respects maxValues in multiple mode', async () => {
    await open({ multiple: true, modelValue: ['a'], maxValues: 1 })
    options()[1].click()
    await nextTick()
    // already at cap → no new emit adding 'b'
    expect(wrapper.emitted()['update:modelValue']).toBeUndefined()
  })

  it('filters options by the search query', async () => {
    await open()
    const search = document.body.querySelector('input[aria-autocomplete="list"]')
    search.value = 'ban'
    search.dispatchEvent(new Event('input'))
    await nextTick()
    expect(options()).toHaveLength(1)
    expect(options()[0].textContent).toContain('Banana')
  })

  it('renders group headers when optionGroup is set', async () => {
    await open({
      options: [
        { id: 'a', name: 'Apple', kind: 'Fruit' },
        { id: 'v', name: 'Carrot', kind: 'Veg' },
      ],
      optionGroup: 'kind',
    })
    const headers = [...document.body.querySelectorAll('[role="presentation"]')].map((h) =>
      h.textContent.trim(),
    )
    expect(headers).toEqual(['Fruit', 'Veg'])
  })

  it('clears the selection via the clear control', async () => {
    wrapper = mount(BaseSelect, {
      props: { options: OPTIONS, optionLabel: 'name', optionValue: 'id', modelValue: 'a', clearable: true },
      attachTo: document.body,
    })
    await nextTick()
    await wrapper.get('[aria-label="Clear selection"]').trigger('click')
    expect(wrapper.emitted()['update:modelValue'].at(-1)).toEqual([null])
    expect(wrapper.emitted().clear).toBeTruthy()
  })

  it('emits filter events in remote mode and skips local filtering', async () => {
    await open({ remote: true })
    const search = document.body.querySelector('input[aria-autocomplete="list"]')
    search.value = 'zzz'
    search.dispatchEvent(new Event('input'))
    await new Promise((r) => setTimeout(r, 350))
    expect(wrapper.emitted().filter.at(-1)).toEqual(['zzz'])
    // local list untouched despite no match
    expect(options()).toHaveLength(3)
  })
})
