import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { DateTime } from 'luxon'
import BaseCalendar from './BaseCalendar.vue'

const JUN = DateTime.fromISO('2026-06-15')

function cell(w, iso) {
  return w.find(`[data-day="${iso}"]`)
}

describe('BaseCalendar', () => {
  it('renders a full month grid for the focused date', () => {
    const w = mount(BaseCalendar, { props: { modelValue: JUN } })
    expect(cell(w, '2026-06-01').exists()).toBe(true)
    expect(cell(w, '2026-06-30').exists()).toBe(true)
  })

  it('marks the selected day aria-selected', () => {
    const w = mount(BaseCalendar, { props: { modelValue: JUN } })
    expect(cell(w, '2026-06-15').attributes('aria-selected')).toBe('true')
  })

  it('emits the clicked day as a DateTime (single mode)', async () => {
    const w = mount(BaseCalendar, { props: { modelValue: JUN } })
    await cell(w, '2026-06-20').trigger('click')
    const emitted = w.emitted('update:modelValue').at(-1)[0]
    expect(DateTime.isDateTime(emitted)).toBe(true)
    expect(emitted.toISODate()).toBe('2026-06-20')
  })

  it('disables days outside [minDate, maxDate]', async () => {
    const w = mount(BaseCalendar, {
      props: { modelValue: JUN, minDate: DateTime.fromISO('2026-06-10'), maxDate: DateTime.fromISO('2026-06-20') },
    })
    expect(cell(w, '2026-06-05').attributes('aria-disabled')).toBe('true')
    await cell(w, '2026-06-05').trigger('click')
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })

  it('builds a range across two clicks (range mode)', async () => {
    const w = mount(BaseCalendar, { props: { modelValue: { start: null, end: null }, selectionMode: 'range' } })
    await cell(w, '2026-06-10').trigger('click')
    await cell(w, '2026-06-14').trigger('click')
    const r = w.emitted('update:modelValue').at(-1)[0]
    expect(r.start.toISODate()).toBe('2026-06-10')
    expect(r.end.toISODate()).toBe('2026-06-14')
  })

  it('ArrowRight moves focus to the next day', async () => {
    const w = mount(BaseCalendar, { props: { modelValue: JUN }, attachTo: document.body })
    const start = cell(w, '2026-06-15')
    start.element.focus()
    await start.trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(document.activeElement.getAttribute('data-day')).toBe('2026-06-16')
    w.unmount()
  })
})
