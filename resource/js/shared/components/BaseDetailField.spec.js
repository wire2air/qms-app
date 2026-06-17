import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseDetailField from './BaseDetailField.vue'

describe('BaseDetailField', () => {
  it('renders the label and the value prop', () => {
    const w = mount(BaseDetailField, { props: { label: 'Supplier code', value: 'SUP-001' } })
    expect(w.text()).toContain('Supplier code')
    expect(w.text()).toContain('SUP-001')
  })

  it('falls back to the em-dash when the value is nullish/empty', () => {
    expect(mount(BaseDetailField, { props: { label: 'X', value: null } }).text()).toContain('—')
    expect(mount(BaseDetailField, { props: { label: 'X', value: '' } }).text()).toContain('—')
  })

  it('supports a custom empty fallback', () => {
    const w = mount(BaseDetailField, { props: { label: 'X', value: null, empty: 'Not set' } })
    expect(w.text()).toContain('Not set')
    expect(w.text()).not.toContain('—')
  })

  it('renders 0 as a real value, not the empty fallback', () => {
    const w = mount(BaseDetailField, { props: { label: 'Count', value: 0 } })
    expect(w.text()).toContain('0')
    expect(w.text()).not.toContain('—')
  })

  it('renders the default slot and does NOT apply the empty fallback to it', () => {
    const w = mount(BaseDetailField, {
      props: { label: 'Site' },
      slots: { default: '<span data-test="badge">HQ</span>' },
    })
    expect(w.find('[data-test="badge"]').exists()).toBe(true)
    expect(w.text()).not.toContain('—')
  })

  it('is not a <label> element (read-only, no associated control)', () => {
    const w = mount(BaseDetailField, { props: { label: 'Site', value: 'HQ' } })
    expect(w.find('label').exists()).toBe(false)
  })

  it('inline layout uses a justify-between row', () => {
    const w = mount(BaseDetailField, { props: { label: 'Status', value: 'Open', layout: 'inline' } })
    expect(w.classes().join(' ')).toContain('tw:justify-between')
  })
})
