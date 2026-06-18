import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import BaseStatCard from './BaseStatCard.vue'

const StubIcon = { name: 'StubIcon', render: () => h('svg', { 'data-icon': 'true' }) }

describe('BaseStatCard', () => {
  it('renders the value and label', () => {
    const w = mount(BaseStatCard, { props: { label: 'Open NCs', value: 12 } })
    expect(w.text()).toContain('12')
    expect(w.text()).toContain('Open NCs')
  })

  it('renders 0 as a real value', () => {
    expect(mount(BaseStatCard, { props: { label: 'X', value: 0 } }).text()).toContain('0')
  })

  it('renders the icon in a tinted box', () => {
    const w = mount(BaseStatCard, { props: { label: 'X', value: 1, icon: StubIcon, iconColor: 'green' } })
    expect(w.find('[data-icon]').exists()).toBe(true)
    expect(w.html()).toContain('tw:bg-green-50')
  })

  it('renders a trend with a direction', () => {
    const w = mount(BaseStatCard, {
      props: { label: 'X', value: 5, trend: { direction: 'up', value: '+3' } },
    })
    expect(w.text()).toContain('+3')
    // up trend reads as positive (good token)
    expect(w.html()).toContain('tw:text-good')
  })

  it('shows a skeleton instead of the value when loading', () => {
    const w = mount(BaseStatCard, { props: { label: 'X', value: 5, loading: true } })
    expect(w.text()).not.toContain('5')
    expect(w.findComponent({ name: 'BaseSkeleton' }).exists()).toBe(true)
  })

  it('renders inside a BaseCard surface', () => {
    const w = mount(BaseStatCard, { props: { label: 'X', value: 1 } })
    expect(w.find('.tw\\:bg-card').exists()).toBe(true)
  })
})
