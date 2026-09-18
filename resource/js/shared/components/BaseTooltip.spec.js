import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseTooltip from './BaseTooltip.vue'

// teleport:false keeps the tooltip inline so it's queryable from the wrapper.
function mountTip(props = {}, slots = {}) {
  return mount(BaseTooltip, {
    props: { content: 'Helpful hint', teleport: false, ...props },
    slots: { default: '<button>Trigger</button>', ...slots },
  })
}

describe('BaseTooltip', () => {
  it('renders the trigger and no tooltip until interaction', () => {
    const w = mountTip()
    expect(w.text()).toContain('Trigger')
    expect(w.find('[role="tooltip"]').exists()).toBe(false)
  })

  it('shows a role=tooltip on hover and wires aria-describedby', async () => {
    const w = mountTip()
    await w.find('span').trigger('mouseenter')
    await nextTick()
    const tip = w.find('[role="tooltip"]')
    expect(tip.exists()).toBe(true)
    expect(tip.text()).toContain('Helpful hint')
    // trigger references the tooltip by id
    expect(w.find('span').attributes('aria-describedby')).toBe(tip.attributes('id'))
  })

  it('hides on mouseleave and drops aria-describedby', async () => {
    const w = mountTip()
    await w.find('span').trigger('mouseenter')
    await nextTick()
    await w.find('span').trigger('mouseleave')
    expect(w.find('[role="tooltip"]').exists()).toBe(false)
    expect(w.find('span').attributes('aria-describedby')).toBeUndefined()
  })

  // Focus opens the tooltip only for KEYBOARD focus. A dialog moves focus to
  // its first focusable element on open; where that is a help icon, a plain
  // focusin handler popped the tooltip over content the user hadn't read yet
  // (reported 2026-08-16 on the step Settings dialog). :focus-visible is the
  // browser's own distinction between keyboard traversal and programmatic or
  // pointer focus.
  it('shows on keyboard focus and hides on focusout', async () => {
    const w = mountTip()
    const span = w.find('span')
    // jsdom won't set :focus-visible for a synthetic event, so assert the
    // guard's contract directly.
    span.element.matches = (sel) => sel === ':focus-visible'

    await span.trigger('focusin')
    await nextTick()
    expect(w.find('[role="tooltip"]').exists()).toBe(true)
    await span.trigger('focusout')
    expect(w.find('[role="tooltip"]').exists()).toBe(false)
  })

  it('does NOT show when focus arrives programmatically', async () => {
    // The reported bug: opening a dialog must not pop a tooltip.
    const w = mountTip()
    const span = w.find('span')
    span.element.matches = () => false

    await span.trigger('focusin')
    await nextTick()
    expect(w.find('[role="tooltip"]').exists()).toBe(false)
  })

  it('still shows on hover regardless of focus', async () => {
    // Pointer users are unaffected by the focus guard. NB: capture the wrapper
    // BEFORE stubbing matches — find() uses element.matches to test selectors,
    // so a stub that always returns false makes the element unfindable.
    const w = mountTip()
    const span = w.find('span')
    span.element.matches = () => false

    await span.trigger('mouseenter')
    await nextTick()
    expect(w.find('[role="tooltip"]').exists()).toBe(true)
  })

  it('hides on Escape', async () => {
    const w = mountTip()
    await w.find('span').trigger('mouseenter')
    await nextTick()
    await w.find('span').trigger('keydown', { key: 'Escape' })
    expect(w.find('[role="tooltip"]').exists()).toBe(false)
  })

  it('renders content from the #content slot', async () => {
    const w = mountTip({ content: '' }, { content: '<em data-test="rich">Rich</em>' })
    await w.find('span').trigger('mouseenter')
    await nextTick()
    expect(w.find('[data-test="rich"]').exists()).toBe(true)
  })

  it('never shows when disabled', async () => {
    const w = mountTip({ disabled: true })
    await w.find('span').trigger('mouseenter')
    await nextTick()
    expect(w.find('[role="tooltip"]').exists()).toBe(false)
  })

  it('never shows when there is no content', async () => {
    const w = mountTip({ content: '' })
    await w.find('span').trigger('mouseenter')
    await nextTick()
    expect(w.find('[role="tooltip"]').exists()).toBe(false)
  })
})
