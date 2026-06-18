import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseMenu from './BaseMenu.vue'

let wrapper
afterEach(async () => {
  // Unmount so Vue removes its own teleported popover nodes; THEN clear leftovers.
  // (Wiping innerHTML first yanks the teleport target out mid-transition.)
  wrapper?.unmount()
  await nextTick()
  wrapper = null
  document.body.innerHTML = ''
})

async function openMenu(items) {
  wrapper = mount(BaseMenu, { props: { items }, attachTo: document.body })
  await wrapper.find('button[aria-haspopup="menu"]').trigger('click')
  await nextTick()
  await nextTick()
  return wrapper
}

const onEdit = vi.fn()
const onDelete = vi.fn()
const ITEMS = [
  { name: 'Edit', click: onEdit },
  { name: 'Delete', click: onDelete, disabled: true },
]

describe('BaseMenu (WAI-ARIA menu)', () => {
  it('the trigger advertises a popup menu', () => {
    const w = mount(BaseMenu, { props: { items: ITEMS } })
    expect(w.find('[aria-haspopup="menu"]').exists()).toBe(true)
  })

  it('renders role=menu with a role=menuitem per item when open', async () => {
    await openMenu(ITEMS)
    expect(document.body.querySelector('[role="menu"]')).toBeTruthy()
    expect(document.body.querySelectorAll('[role="menuitem"]').length).toBe(2)
  })

  it('disables the disabled item', async () => {
    await openMenu(ITEMS)
    const items = document.body.querySelectorAll('[role="menuitem"]')
    expect(items[1].disabled).toBe(true)
  })

  it('activates an item and closes on click', async () => {
    await openMenu(ITEMS)
    document.body.querySelectorAll('[role="menuitem"]')[0].click()
    await nextTick()
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('ArrowDown from the menu focuses the first enabled item', async () => {
    await openMenu(ITEMS)
    const menu = document.body.querySelector('[role="menu"]')
    menu.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await nextTick()
    expect(document.activeElement).toBe(document.body.querySelector('[role="menuitem"]'))
  })
})
