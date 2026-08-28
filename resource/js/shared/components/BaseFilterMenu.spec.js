import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseFilterMenu from './BaseFilterMenu.vue'

const ITEMS = [
  {
    id: 'status',
    label: 'Status',
    group: 'statusId',
    options: [
      { value: 'OPEN', label: 'Open', count: 12 },
      { value: 'CLOSED', label: 'Closed', count: 3 },
    ],
  },
  {
    id: 'priority',
    label: 'Priority',
    group: 'priority',
    select: 'radio',
    options: [{ value: 'HIGH', label: 'High' }],
  },
]

const mounted = []
function mountMenu(modelValue = {}) {
  const w = mount(BaseFilterMenu, { attachTo: document.body, props: { items: ITEMS, modelValue } })
  mounted.push(w)
  return w
}
afterEach(() => {
  while (mounted.length) mounted.pop().unmount()
  document.body.innerHTML = ''
})

function rowByText(text) {
  return [...document.body.querySelectorAll('[data-row]')].find((b) => b.textContent.includes(text))
}

describe('BaseFilterMenu (cascading)', () => {
  it('shows the active-filter count on the trigger', () => {
    const w = mountMenu({ statusId: ['OPEN'], priority: 'HIGH' })
    expect(w.get('button').text()).toContain('Filter')
    expect(w.get('button').text()).toContain('2')
  })

  it('opens the root flyout listing top-level dimensions', async () => {
    const w = mountMenu()
    await w.get('button').trigger('click')
    await nextTick()
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull()
    expect(rowByText('Status')).toBeTruthy()
    expect(rowByText('Priority')).toBeTruthy()
  })

  it('opens a submenu of values when a dimension is chosen', async () => {
    const w = mountMenu()
    await w.get('button').trigger('click')
    await nextTick()
    rowByText('Status').click()
    await nextTick()
    expect(rowByText('Open')).toBeTruthy()
    expect(rowByText('Closed')).toBeTruthy()
  })

  it('toggles a leaf value into the model (multi-select)', async () => {
    const w = mountMenu()
    await w.get('button').trigger('click')
    await nextTick()
    rowByText('Status').click()
    await nextTick()
    rowByText('Open').click()
    await nextTick()
    expect(w.emitted('update:modelValue').at(-1)[0]).toEqual({ statusId: ['OPEN'] })
  })

  it('radio dimension sets a single value', async () => {
    const w = mountMenu()
    await w.get('button').trigger('click')
    await nextTick()
    rowByText('Priority').click()
    await nextTick()
    rowByText('High').click()
    await nextTick()
    expect(w.emitted('update:modelValue').at(-1)[0]).toEqual({ priority: 'HIGH' })
  })

  it('opens the calendar date panel for a type:date node and a preset writes a token', async () => {
    const items = [{ id: 'created', label: 'Created', group: 'createdAt', type: 'date' }]
    const w = mount(BaseFilterMenu, { attachTo: document.body, props: { items, modelValue: {} } })
    mounted.push(w)
    await w.get('button').trigger('click')
    await nextTick()
    rowByText('Created').click()
    await nextTick()
    // The calendar-first panel (BaseDateRangeFilter, 2026-08-28): preset
    // buttons + a range calendar, no operator <select>.
    const preset = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Last 7 days',
    )
    expect(preset).toBeTruthy()
    preset.click()
    await nextTick()
    const token = w.emitted('update:modelValue').at(-1)[0].createdAt
    expect(token.operator).toBe('relative')
    expect(token.relative).toEqual({ dir: 'past', unit: 'day', count: 7 })
    expect(token.presetId).toBe('last_7_days')
  })
})
