import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import BaseQrCode from './BaseQrCode.vue'

describe('BaseQrCode', () => {
  it('renders an SVG QR code for a value', async () => {
    const w = mount(BaseQrCode, { props: { value: 'https://example.com/r/1' } })
    await flushPromises()
    expect(w.find('svg').exists()).toBe(true)
  })

  it('exposes itself as an accessible image', async () => {
    const w = mount(BaseQrCode, { props: { value: 'ASSET-42' } })
    await flushPromises()
    expect(w.attributes('role')).toBe('img')
    expect(w.attributes('aria-label')).toContain('ASSET-42')
  })

  it('re-renders when the value changes', async () => {
    const w = mount(BaseQrCode, { props: { value: 'one' } })
    await flushPromises()
    const first = w.find('svg').html()
    await w.setProps({ value: 'a-totally-different-value' })
    await flushPromises()
    expect(w.find('svg').html()).not.toBe(first)
  })

  it('renders nothing for an empty value', async () => {
    const w = mount(BaseQrCode, { props: { value: '' } })
    await flushPromises()
    expect(w.find('svg').exists()).toBe(false)
  })

  it('applies the requested size', async () => {
    const w = mount(BaseQrCode, { props: { value: 'x', size: 200 } })
    await flushPromises()
    expect(w.attributes('style')).toContain('200px')
  })
})
