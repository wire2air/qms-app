import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import BaseStatStrip from './BaseStatStrip.vue'

const Icon = { name: 'Icon', render: () => h('svg', { 'data-icon': 'true' }) }

describe('BaseStatStrip', () => {
  it('renders a labelled value per item', () => {
    const w = mount(BaseStatStrip, {
      props: {
        items: [
          { key: 'open', label: 'Open NCs', value: 51, icon: Icon, color: 'blue' },
          { key: 'overdue', label: 'Overdue', value: 4, color: 'red', emphasize: true },
        ],
      },
    })
    expect(w.text()).toContain('Open NCs')
    expect(w.text()).toContain('51')
    expect(w.text()).toContain('Overdue')
    expect(w.findAll('[data-icon]')).toHaveLength(1) // only the first item has an icon
  })

  it('tints the value only when emphasized', () => {
    const w = mount(BaseStatStrip, {
      props: {
        items: [
          { key: 'a', label: 'Plain', value: 0, color: 'red' },
          { key: 'b', label: 'Hot', value: 9, color: 'red', emphasize: true },
        ],
      },
    })
    const values = w.findAll('.tw\\:text-lg')
    expect(values[0].classes()).toContain('tw:text-on-main')
    expect(values[1].classes()).toContain('tw:text-red-600')
  })

  it('falls back to an em dash for a null value', () => {
    const w = mount(BaseStatStrip, { props: { items: [{ key: 'x', label: 'X', value: null }] } })
    expect(w.text()).toContain('—')
  })
})
