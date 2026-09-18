import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseCommandPalette from './BaseCommandPalette.vue'
import { registerCommands } from '../composables/useCommandRegistry.js'

const cleanups = []
const mounted = []
function register(list) {
  const off = registerCommands(list)
  cleanups.push(off)
  return off
}
function mountPalette() {
  const w = mount(BaseCommandPalette, { attachTo: document.body })
  mounted.push(w)
  return w
}
afterEach(() => {
  while (mounted.length) mounted.pop().unmount()
  while (cleanups.length) cleanups.pop()()
  document.body.innerHTML = ''
})

function press(init) {
  window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
}

describe('BaseCommandPalette', () => {
  it('opens on ⌘K and lists registered commands', async () => {
    register([{ id: 't.docs', title: 'Go to Documents', group: 'Navigate', perform: () => {} }])
    mountPalette()
    expect(document.body.querySelector('[role="combobox"]')).toBeNull()
    press({ key: 'k', metaKey: true })
    await nextTick()
    expect(document.body.querySelector('[role="combobox"]')).not.toBeNull()
    expect(document.body.textContent).toContain('Go to Documents')
  })

  it('also opens on ⌘P', async () => {
    mountPalette()
    press({ key: 'p', metaKey: true })
    await nextTick()
    expect(document.body.querySelector('[role="combobox"]')).not.toBeNull()
  })

  it('filters by query and runs the active command on Enter', async () => {
    const docs = vi.fn()
    const nc = vi.fn()
    register([
      { id: 't.docs', title: 'Go to Documents', group: 'Navigate', perform: docs },
      { id: 't.nc', title: 'Create nonconformance', group: 'Actions', perform: nc },
    ])
    mountPalette()
    press({ key: 'k', metaKey: true })
    await nextTick()
    const input = document.body.querySelector('[role="combobox"]')
    input.value = 'nonconf'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await nextTick()
    expect(nc).toHaveBeenCalledOnce()
    expect(docs).not.toHaveBeenCalled()
    // palette closes after running
    expect(document.body.querySelector('[role="combobox"]')).toBeNull()
  })

  it('closes on Escape', async () => {
    register([{ id: 't.x', title: 'X', perform: () => {} }])
    mountPalette()
    press({ key: 'k', metaKey: true })
    await nextTick()
    const input = document.body.querySelector('[role="combobox"]')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(document.body.querySelector('[role="combobox"]')).toBeNull()
  })

  it('shows an empty state when nothing matches', async () => {
    register([{ id: 't.x', title: 'Apple', perform: () => {} }])
    mountPalette()
    press({ key: 'k', metaKey: true })
    await nextTick()
    const input = document.body.querySelector('[role="combobox"]')
    input.value = 'zzzzz'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    expect(document.body.textContent).toContain('No matching commands')
  })
})
