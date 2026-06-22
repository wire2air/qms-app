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

  // --- New tests ---

  it('roving tabindex follows focus via ArrowRight', async () => {
    const w = mount(BaseCalendar, { props: { modelValue: JUN }, attachTo: document.body })
    // Initially the selected day (2026-06-15) should have tabindex 0
    expect(cell(w, '2026-06-15').attributes('tabindex')).toBe('0')
    expect(cell(w, '2026-06-14').attributes('tabindex')).toBe('-1')

    // Trigger ArrowRight on the focused cell
    const start = cell(w, '2026-06-15')
    start.element.focus()
    await start.trigger('keydown', { key: 'ArrowRight' })
    await nextTick()

    // After arrow navigation, 2026-06-16 gets tabindex 0, 2026-06-15 loses it
    expect(cell(w, '2026-06-16').attributes('tabindex')).toBe('0')
    expect(cell(w, '2026-06-15').attributes('tabindex')).toBe('-1')
    w.unmount()
  })

  it('weekNumbers renders a week-number column with role="row" structure', () => {
    const w = mount(BaseCalendar, { props: { modelValue: JUN, weekNumbers: true } })

    // Should have role="row" elements (header + 6 week rows)
    const rows = w.findAll('[role="row"]')
    expect(rows.length).toBeGreaterThanOrEqual(7) // 1 header + 6 week rows

    // Each week row should use 8 columns (week number + 7 days)
    const weekRows = rows.filter((r) => r.find('[role="gridcell"]').exists())
    expect(weekRows.length).toBe(6)

    // Week number spans should be present (aria-hidden, non-gridcell)
    // The first week of June 2026 — luxon weekNumber should be a positive integer
    const allSpans = w.findAll('span[aria-hidden="true"]')
    // Filter to those that look like week numbers (short numeric text)
    const weekNumSpans = allSpans.filter((s) => /^\d+$/.test(s.text().trim()))
    expect(weekNumSpans.length).toBeGreaterThanOrEqual(6)

    // Confirm none of the week-number spans have role="gridcell"
    weekNumSpans.forEach((s) => {
      expect(s.attributes('role')).not.toBe('gridcell')
    })
  })

  it('timezone prop: renders without error and shows day cells', () => {
    // Smoke test — just verify the grid renders day cells when a timezone is applied
    const w = mount(BaseCalendar, { props: { modelValue: null, timezone: 'Asia/Tokyo' } })
    // Should render 42 day cells (6 weeks × 7 days)
    const dayCells = w.findAll('[role="gridcell"]')
    expect(dayCells.length).toBe(42)
    // Each cell should have a valid data-day attribute
    dayCells.forEach((c) => {
      expect(c.attributes('data-day')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })
})
