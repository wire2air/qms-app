import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DetailTabs from './DetailTabs.vue'

const tabs = [
  { value: 'overview', label: 'Overview' },
  { value: 'docs', label: 'Documents', count: 12 },
  { value: 'secret', label: 'Secret', visible: false },
]

describe('DetailTabs', () => {
  it('renders only visible tabs with count → badge', () => {
    const w = mount(DetailTabs, {
      props: { tabs, modelValue: 'overview' },
      slots: { 'tab-overview': '<div data-test="ov">OV</div>', 'tab-docs': '<div>D</div>' },
    })
    expect(w.text()).toContain('Overview')
    expect(w.text()).toContain('Documents')
    expect(w.text()).toContain('12') // badge
    expect(w.text()).not.toContain('Secret')
  })

  it('shows the active panel slot', () => {
    const w = mount(DetailTabs, {
      props: { tabs, modelValue: 'overview' },
      slots: { 'tab-overview': '<div data-test="ov">OV</div>' },
    })
    expect(w.find('[data-test="ov"]').exists()).toBe(true)
  })

  it('emits update:modelValue handled by v-model (default first tab when null)', () => {
    const w = mount(DetailTabs, { props: { tabs, modelValue: null }, slots: { 'tab-overview': '<div/>' } })
    // BaseTabs auto-selects first visible tab when model is null
    expect(w.emitted('update:modelValue')?.[0]?.[0]).toBe('overview')
  })
})
