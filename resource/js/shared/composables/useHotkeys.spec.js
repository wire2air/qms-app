import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import { useHotkeys, useHotkeyRegistry } from './useHotkeys.js'

const mounted = []
function harness(bindings, options) {
  let api, reg
  const Comp = {
    setup() {
      api = useHotkeys(bindings, options)
      reg = useHotkeyRegistry()
      return () => h('div')
    },
  }
  const wrapper = mount(Comp, { attachTo: document.body })
  mounted.push(wrapper)
  return { api, reg, wrapper }
}

function press(init) {
  window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
}

// Unmount every harness so the module-level registry resets between tests.
afterEach(() => {
  while (mounted.length) mounted.pop().unmount()
  document.body.innerHTML = ''
})

describe('useHotkeys', () => {
  it('fires the handler when its chord matches', () => {
    const handler = vi.fn()
    harness({ keys: 'mod+k', handler })
    press({ key: 'k', metaKey: true })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('supports multiple chords for one binding', () => {
    const handler = vi.fn()
    harness({ keys: ['/', 's'], handler })
    press({ key: 's' })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('respects the when() gate', () => {
    const handler = vi.fn()
    let enabled = false
    harness({ keys: 'g', handler, when: () => enabled })
    press({ key: 'g' })
    expect(handler).not.toHaveBeenCalled()
    enabled = true
    press({ key: 'g' })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('ignores shortcuts while typing in a field unless allowInInput', () => {
    const handler = vi.fn()
    harness({ keys: '/', handler })
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }))
    expect(handler).not.toHaveBeenCalled()
  })

  it('exposes described bindings in the grouped registry and cleans up on unmount', () => {
    const { reg, wrapper } = harness([
      { keys: 'mod+k', description: 'Command palette', group: 'Global', handler: () => {} },
      { keys: 'esc', handler: () => {} }, // no description → hidden from help
    ])
    const global = reg.groups.value.find((g) => g.group === 'Global')
    expect(global.items).toHaveLength(1)
    expect(global.items[0].description).toBe('Command palette')
    wrapper.unmount()
    expect(reg.all.value).toHaveLength(0)
  })
})
