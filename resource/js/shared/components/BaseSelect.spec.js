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
      props: {
        options: OPTIONS,
        optionLabel: 'name',
        optionValue: 'id',
        modelValue: 'a',
        clearable: true,
      },
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

  describe('nullLabel "All" option', () => {
    it('prepends a synthetic null option when set and not required', async () => {
      await open({ nullLabel: '— All fruit —' })
      expect(options()).toHaveLength(4)
      expect(options()[0].textContent).toContain('All fruit')
    })

    it('does not render the null option when required', async () => {
      await open({ nullLabel: '— All fruit —', required: true })
      expect(options()).toHaveLength(3)
      expect(options()[0].textContent).toContain('Apple')
    })

    it('clears the selection to null when the null option is picked', async () => {
      await open({ nullLabel: '— All fruit —', modelValue: 'b' })
      options()[0].click()
      await nextTick()
      expect(wrapper.emitted()['update:modelValue'].at(-1)).toEqual([null])
      expect(wrapper.emitted().clear).toBeTruthy()
    })

    // Regression: the null row is a clear-to-EMPTY control. On a multiple select
    // it read as "All roles" but wiped every selection when picked — on the user
    // detail page that unassigned every role the user had.
    it('does not render the null option on a multiple select', async () => {
      await open({ nullLabel: '— All fruit —', multiple: true })
      expect(options()).toHaveLength(3)
      expect(options()[0].textContent).toContain('Apple')
    })

    it('shows the null label in the trigger when nothing is selected', () => {
      wrapper = mount(BaseSelect, {
        props: {
          options: OPTIONS,
          optionLabel: 'name',
          optionValue: 'id',
          nullLabel: '— All fruit —',
          placeholder: 'Pick one',
        },
      })
      expect(wrapper.text()).toContain('All fruit')
      expect(wrapper.text()).not.toContain('Pick one')
    })
  })

  it('renders a #footer slot with a working close() callback', async () => {
    wrapper = mount(BaseSelect, {
      props: { options: OPTIONS, optionLabel: 'name', optionValue: 'id' },
      slots: {
        footer: `<template #footer="{ close }"><button data-add @click="close">Add new</button></template>`,
      },
      attachTo: document.body,
    })
    await wrapper.get('[aria-haspopup="listbox"]').trigger('click')
    await nextTick()
    await nextTick()
    const add = document.body.querySelector('[data-add]')
    // Footer renders below the option list, inside the open panel.
    expect(add).toBeTruthy()
    expect(add.textContent).toBe('Add new')
    expect(options()).toHaveLength(3)
    // close() is wired (BasePopover dismissal itself isn't exercised in jsdom).
    expect(() => add.click()).not.toThrow()
  })

  it('replaces the trigger chrome with a #trigger slot when provided', () => {
    wrapper = mount(BaseSelect, {
      props: { options: OPTIONS, optionLabel: 'name', optionValue: 'id' },
      slots: { trigger: `<button data-add>+ Add</button>` },
    })
    expect(wrapper.find('[data-add]').exists()).toBe(true)
    // default combobox chrome is not rendered
    expect(wrapper.find('[role="combobox"]').exists()).toBe(false)
  })

  it('exposes open/close/toggle methods', () => {
    wrapper = mount(BaseSelect, {
      props: { options: OPTIONS, optionLabel: 'name', optionValue: 'id' },
    })
    expect(typeof wrapper.vm.open).toBe('function')
    expect(typeof wrapper.vm.close).toBe('function')
    expect(typeof wrapper.vm.toggle).toBe('function')
  })

  it('exposes remove() to the #selected slot for per-item clear', async () => {
    wrapper = mount(BaseSelect, {
      props: {
        options: OPTIONS,
        optionLabel: 'name',
        optionValue: 'id',
        multiple: true,
        modelValue: ['a', 'b'],
      },
      slots: {
        selected: `<template #selected="{ options, remove }">
          <button
            v-for="o in options"
            :key="o.value"
            :data-remove="o.value"
            @click.stop="remove(o)"
          >{{ o.label }}</button>
        </template>`,
      },
      attachTo: document.body,
    })
    await nextTick()
    document.body.querySelector('[data-remove="a"]').click()
    await nextTick()
    expect(wrapper.emitted()['update:modelValue'].at(-1)).toEqual([['b']])
  })

  // `required` refuses to remove the last value. That refusal is silent, so a
  // consumer rendering its own chips in #selected had no way to know its "×"
  // would do nothing — which is how it shipped and was reported (2026-08-16).
  // `canRemove` is the slot's way to ask before drawing the affordance.
  describe('canRemove (the #selected slot contract)', () => {
    function mountWithSlot(props) {
      return mount(BaseSelect, {
        props: {
          options: OPTIONS,
          optionLabel: 'name',
          optionValue: 'id',
          multiple: true,
          ...props,
        },
        slots: {
          selected: `
            <template #default="{ options, canRemove, remove }">
              <button
                v-for="o in options"
                :key="o.value"
                :data-can="canRemove(o)"
                :data-opt="o.value"
                @click="remove(o)"
              >x</button>
            </template>`,
        },
        attachTo: document.body,
      })
    }

    it('refuses the last value when required, and says so', async () => {
      wrapper = mountWithSlot({ required: true, modelValue: ['a'] })
      await nextTick()
      const chip = wrapper.get('[data-opt="a"]')
      expect(chip.attributes('data-can')).toBe('false')

      await chip.trigger('click')
      // No update emitted — the value is still there.
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('allows removal when required but more than one remains', async () => {
      wrapper = mountWithSlot({ required: true, modelValue: ['a', 'b'] })
      await nextTick()
      const chip = wrapper.get('[data-opt="a"]')
      expect(chip.attributes('data-can')).toBe('true')

      await chip.trigger('click')
      expect(wrapper.emitted('update:modelValue')[0][0]).toEqual(['b'])
    })

    it('allows removing the last value when NOT required', async () => {
      wrapper = mountWithSlot({ modelValue: ['a'] })
      await nextTick()
      expect(wrapper.get('[data-opt="a"]').attributes('data-can')).toBe('true')

      await wrapper.get('[data-opt="a"]').trigger('click')
      expect(wrapper.emitted('update:modelValue')[0][0]).toEqual([])
    })

    it('refuses everything while readonly', async () => {
      wrapper = mountWithSlot({ readonly: true, modelValue: ['a', 'b'] })
      await nextTick()
      expect(wrapper.get('[data-opt="a"]').attributes('data-can')).toBe('false')
    })
  })
})
