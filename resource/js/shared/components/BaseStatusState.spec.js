import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import BaseStatusState from './BaseStatusState.vue'

const StubIcon = { name: 'StubIcon', render: () => h('svg', { 'data-icon': 'true' }) }

describe('BaseStatusState', () => {
  it('defaults to the empty variant with its default title', () => {
    const w = mount(BaseStatusState)
    expect(w.text()).toContain('No results found')
  })

  it('uses per-variant default titles', () => {
    expect(mount(BaseStatusState, { props: { variant: 'error' } }).text()).toContain('Something went wrong')
    expect(mount(BaseStatusState, { props: { variant: 'success' } }).text()).toContain('All done')
    expect(mount(BaseStatusState, { props: { variant: 'notfound' } }).text()).toContain('Not found')
  })

  it('supports the enterprise feedback states (denied / offline / maintenance)', () => {
    expect(mount(BaseStatusState, { props: { variant: 'denied' } }).text()).toContain("You don't have access")
    expect(mount(BaseStatusState, { props: { variant: 'offline' } }).text()).toContain("You're offline")
    expect(mount(BaseStatusState, { props: { variant: 'maintenance' } }).text()).toContain('Down for maintenance')
    // denied uses the warn tint
    expect(mount(BaseStatusState, { props: { variant: 'denied' } }).html()).toContain('tw:text-warn')
  })

  it('tints the icon per variant (error = red, success = green)', () => {
    expect(mount(BaseStatusState, { props: { variant: 'error' } }).html()).toContain('tw:text-bad')
    expect(mount(BaseStatusState, { props: { variant: 'success' } }).html()).toContain('tw:text-good')
  })

  it('lets title / description / icon be overridden', () => {
    const w = mount(BaseStatusState, {
      props: { variant: 'error', title: 'Custom', description: 'Try again later', icon: StubIcon },
    })
    expect(w.text()).toContain('Custom')
    expect(w.text()).toContain('Try again later')
    expect(w.find('[data-icon]').exists()).toBe(true)
  })

  it('renders the #action slot', () => {
    const w = mount(BaseStatusState, { slots: { action: '<button data-test="a">Retry</button>' } })
    expect(w.find('[data-test="a"]').exists()).toBe(true)
  })

  it('validates the variant prop', () => {
    const { validator } = BaseStatusState.props.variant
    expect(validator('empty')).toBe(true)
    expect(validator('denied')).toBe(true)
    expect(validator('offline')).toBe(true)
    expect(validator('maintenance')).toBe(true)
    expect(validator('bogus')).toBe(false)
  })
})
