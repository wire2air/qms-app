import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseQuickFilterPills from './BaseQuickFilterPills.vue'

const PILLS = [
  { value: 'all_open', label: 'All open' },
  { value: 'mine', label: 'My NCs' },
  { value: 'overdue', label: 'Overdue', count: 3 },
  { value: 'spam', label: 'Spam', color: 'red' },
]

describe('BaseQuickFilterPills', () => {
  it('renders a button per pill', () => {
    const w = mount(BaseQuickFilterPills, { props: { pills: PILLS, modelValue: 'all_open' } })
    expect(w.findAll('button')).toHaveLength(4)
    expect(w.text()).toContain('My NCs')
  })

  it('marks the active pill with aria-pressed', () => {
    const w = mount(BaseQuickFilterPills, { props: { pills: PILLS, modelValue: 'mine' } })
    const buttons = w.findAll('button')
    expect(buttons[1].attributes('aria-pressed')).toBe('true')
    expect(buttons[0].attributes('aria-pressed')).toBe('false')
  })

  it('updates the model when a pill is clicked', async () => {
    const w = mount(BaseQuickFilterPills, { props: { pills: PILLS, modelValue: 'all_open' } })
    await w.findAll('button')[2].trigger('click')
    expect(w.emitted('update:modelValue')[0]).toEqual(['overdue'])
  })

  it('renders a count when a pill provides one', () => {
    const w = mount(BaseQuickFilterPills, { props: { pills: PILLS, modelValue: 'all_open' } })
    expect(w.text()).toContain('3')
  })

  it('exposes the group with an accessible name', () => {
    const w = mount(BaseQuickFilterPills, {
      props: { pills: PILLS, modelValue: 'all_open', ariaLabel: 'Quick filters' },
    })
    const group = w.find('[role="group"]')
    expect(group.exists()).toBe(true)
    expect(group.attributes('aria-label')).toBe('Quick filters')
  })

  it('uses bg-card (theme-aware) for inactive pills, not hardcoded bg-white', () => {
    const w = mount(BaseQuickFilterPills, { props: { pills: PILLS, modelValue: 'mine' } })
    const inactive = w.findAll('button')[0]
    expect(inactive.classes().join(' ')).toContain('tw:bg-card')
    expect(inactive.classes().join(' ')).not.toContain('tw:bg-white')
  })

  it('applies a per-pill color scheme when active', () => {
    const w = mount(BaseQuickFilterPills, { props: { pills: PILLS, modelValue: 'spam' } })
    const spam = w.findAll('button')[3]
    expect(spam.classes().join(' ')).toContain('tw:text-red-700')
  })
})
