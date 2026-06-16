import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseClickableRow from './BaseClickableRow.vue'

const RouterLinkStub = {
  name: 'RouterLink',
  props: ['to'],
  template: "<a :href=\"typeof to === 'string' ? to : '#'\"><slot /></a>",
}

function mountRow(props = {}, slots = { default: 'Open group' }) {
  return mount(BaseClickableRow, {
    props,
    slots,
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('BaseClickableRow', () => {
  it('is keyboard-focusable with a button role in the default (action) mode', () => {
    const w = mountRow()
    const el = w.get('[role="button"]')
    expect(el.attributes('tabindex')).toBe('0')
  })

  it('emits click on mouse click', async () => {
    const w = mountRow()
    await w.get('[role="button"]').trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('emits click on Enter and Space (keyboard activation)', async () => {
    const w = mountRow()
    const el = w.get('[role="button"]')
    await el.trigger('keydown', { key: 'Enter' })
    await el.trigger('keydown', { key: ' ' })
    expect(w.emitted('click')).toHaveLength(2)
  })

  it('does not activate when disabled (no click, removed from tab order)', async () => {
    const w = mountRow({ disabled: true })
    const el = w.get('[role="button"]')
    expect(el.attributes('tabindex')).toBe('-1')
    expect(el.attributes('aria-disabled')).toBe('true')
    await el.trigger('click')
    await el.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('click')).toBeUndefined()
  })

  it('renders a semantic RouterLink (<a>) when `to` is provided', () => {
    const w = mountRow({ to: '/groups/123' })
    expect(w.find('a').exists()).toBe(true)
    expect(w.find('[role="button"]').exists()).toBe(false)
  })
})
