import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseAvatar from './BaseAvatar.vue'

describe('BaseAvatar', () => {
  it('shows initials from the name (up to two)', () => {
    expect(mount(BaseAvatar, { props: { name: 'Jane Doe' } }).text()).toBe('JD')
    expect(mount(BaseAvatar, { props: { name: 'madeline cote' } }).text()).toBe('MC')
    expect(mount(BaseAvatar, { props: { name: 'Cher' } }).text()).toBe('C')
  })

  it('renders the image when src is provided', () => {
    const w = mount(BaseAvatar, { props: { name: 'Jane', src: 'https://e.com/a.png' } })
    const img = w.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('alt')).toBe('Jane')
  })

  it('falls back to initials when the image errors', async () => {
    const w = mount(BaseAvatar, { props: { name: 'Jane Doe', src: 'broken' } })
    await w.find('img').trigger('error')
    expect(w.find('img').exists()).toBe(false)
    expect(w.text()).toBe('JD')
  })

  it('falls back to an icon when there is no name or image', () => {
    const w = mount(BaseAvatar, {})
    expect(w.find('svg').exists()).toBe(true)
  })

  it('is an accessible image with the name as its label', () => {
    const w = mount(BaseAvatar, { props: { name: 'Jane Doe' } })
    expect(w.attributes('role')).toBe('img')
    expect(w.attributes('aria-label')).toBe('Jane Doe')
  })

  it('applies size + shape', () => {
    const cls = mount(BaseAvatar, { props: { name: 'A', size: 'lg', shape: 'square' } }).classes().join(' ')
    expect(cls).toContain('tw:size-12')
    expect(cls).toContain('tw:rounded-lg')
  })

  it('gives the same name the same deterministic tint', () => {
    const a = mount(BaseAvatar, { props: { name: 'Repeatable' } }).classes().join(' ')
    const b = mount(BaseAvatar, { props: { name: 'Repeatable' } }).classes().join(' ')
    expect(a).toBe(b)
  })
})
