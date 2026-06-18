import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseToast from './BaseToast.vue'

describe('BaseToast — taxonomy + live-region a11y', () => {
  it('renders the message', () => {
    const w = mount(BaseToast, { props: { id: 1, type: 'success', message: 'Saved!' } })
    expect(w.text()).toContain('Saved!')
  })

  it('errors are assertive alerts', () => {
    const w = mount(BaseToast, { props: { id: 1, type: 'error', message: 'Boom' } })
    const root = w.get('[role]')
    expect(root.attributes('role')).toBe('alert')
    expect(root.attributes('aria-live')).toBe('assertive')
  })

  it('non-errors are polite status messages', () => {
    const w = mount(BaseToast, { props: { id: 1, type: 'success', message: 'ok' } })
    const root = w.get('[role]')
    expect(root.attributes('role')).toBe('status')
    expect(root.attributes('aria-live')).toBe('polite')
  })

  it('accepts legacy positive/negative aliases', () => {
    const pos = mount(BaseToast, { props: { id: 1, type: 'positive', message: 'ok' } })
    expect(pos.get('[role]').attributes('role')).toBe('status') // → success
    const neg = mount(BaseToast, { props: { id: 2, type: 'negative', message: 'no' } })
    expect(neg.get('[role]').attributes('role')).toBe('alert') // → error
  })

  it('the dismiss button has an accessible name and emits dismiss with the id', async () => {
    const w = mount(BaseToast, { props: { id: 7, type: 'info', message: 'hi' } })
    const btn = w.get('button')
    expect(btn.attributes('aria-label')).toBe('Dismiss notification')
    await btn.trigger('click')
    expect(w.emitted('dismiss').at(-1)).toEqual([7])
  })
})
