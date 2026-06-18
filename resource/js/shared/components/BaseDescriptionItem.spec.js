import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseDescriptionItem from './BaseDescriptionItem.vue'

describe('BaseDescriptionItem', () => {
  it('renders the label in a <dt> and the value in a <dd>', () => {
    const w = mount(BaseDescriptionItem, { props: { label: 'Owner', value: 'Jane' } })
    expect(w.find('dt').text()).toContain('Owner')
    expect(w.find('dd').text()).toContain('Jane')
  })

  it('falls back to the em-dash when the value is nullish/empty', () => {
    expect(mount(BaseDescriptionItem, { props: { label: 'X', value: null } }).find('dd').text()).toBe('—')
    expect(mount(BaseDescriptionItem, { props: { label: 'X', value: '' } }).find('dd').text()).toBe('—')
  })

  it('renders 0 as a real value, not the empty fallback', () => {
    const w = mount(BaseDescriptionItem, { props: { label: 'Count', value: 0 } })
    expect(w.find('dd').text()).toContain('0')
    expect(w.find('dd').text()).not.toContain('—')
  })

  it('supports a custom empty fallback', () => {
    const w = mount(BaseDescriptionItem, { props: { label: 'X', value: null, empty: 'Not set' } })
    expect(w.find('dd').text()).toBe('Not set')
  })

  it('renders the default slot and does NOT apply the empty fallback to it', () => {
    const w = mount(BaseDescriptionItem, {
      props: { label: 'Status' },
      slots: { default: '<span data-test="badge">Open</span>' },
    })
    expect(w.find('[data-test="badge"]').exists()).toBe(true)
    expect(w.find('dd').text()).not.toContain('—')
  })

  it('renders a custom label slot', () => {
    const w = mount(BaseDescriptionItem, {
      slots: { label: '<span data-test="lbl">Custom</span>' },
    })
    expect(w.find('[data-test="lbl"]').exists()).toBe(true)
  })

  it('inline layout (default) lays the row out as justify-between', () => {
    const w = mount(BaseDescriptionItem, { props: { label: 'X', value: 'Y' } })
    expect(w.classes().join(' ')).toContain('tw:justify-between')
  })

  it('stacked layout puts the label above the value (no justify-between)', () => {
    const w = mount(BaseDescriptionItem, { props: { label: 'X', value: 'Y', layout: 'stacked' } })
    expect(w.classes().join(' ')).not.toContain('tw:justify-between')
  })
})
