import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import HotkeyHelp from './HotkeyHelp.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('HotkeyHelp', () => {
  it('opens on "?" and lists its own described shortcut', async () => {
    const w = mount(HotkeyHelp, { attachTo: document.body })
    await nextTick()
    expect(document.body.textContent).not.toContain('Keyboard shortcuts')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))
    await nextTick()
    await nextTick()

    expect(document.body.textContent).toContain('Keyboard shortcuts')
    expect(document.body.textContent).toContain('Show keyboard shortcuts')
    w.unmount()
  })

  it('does not open while typing in a field', async () => {
    const w = mount(HotkeyHelp, { attachTo: document.body })
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
    await nextTick()
    expect(document.body.textContent).not.toContain('Keyboard shortcuts')
    w.unmount()
  })
})
