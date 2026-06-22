// resource/js/shared/components/BaseDateField.spec.js
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { DateTime } from 'luxon'
import '@/extensions/datetime.js'
import BaseDateField from './BaseDateField.vue'

const mounted = []
function mountField(props = {}) {
  const w = mount(BaseDateField, { attachTo: document.body, props })
  mounted.push(w)
  return w
}
afterEach(() => {
  while (mounted.length) mounted.pop().unmount()
  document.body.innerHTML = ''
})

describe('BaseDateField (date mode)', () => {
  it('shows the placeholder when empty', () => {
    const w = mountField({ modelValue: null, placeholder: 'Pick a date' })
    expect(w.get('button').text()).toContain('Pick a date')
  })

  it('formats a DateTime value with dt.formatDate', () => {
    const d = DateTime.fromISO('2026-06-22')
    const w = mountField({ modelValue: d })
    expect(w.get('button').text()).toContain(d.formatDate('date'))
  })

  it('opens the calendar popover on click and emits open', async () => {
    const w = mountField({ modelValue: null })
    await w.get('button').trigger('click')
    await nextTick()
    expect(document.body.querySelector('[role="application"]')).not.toBeNull()
    expect(w.emitted('open')).toBeTruthy()
  })

  it('emits a DateTime when a day is picked', async () => {
    const w = mountField({ modelValue: DateTime.fromISO('2026-06-15') })
    await w.get('button').trigger('click')
    await nextTick()
    document.body.querySelector('[data-day="2026-06-20"]').click()
    await nextTick()
    const v = w.emitted('update:modelValue').at(-1)[0]
    expect(v.toISODate()).toBe('2026-06-20')
  })

  it('valueFormat=iso emits an ISO date string', async () => {
    const w = mountField({ modelValue: '2026-06-15', valueFormat: 'iso' })
    await w.get('button').trigger('click')
    await nextTick()
    document.body.querySelector('[data-day="2026-06-20"]').click()
    await nextTick()
    expect(w.emitted('update:modelValue').at(-1)[0]).toBe('2026-06-20')
  })

  it('clearable clears the value and emits clear', async () => {
    const w = mountField({ modelValue: DateTime.fromISO('2026-06-15'), clearable: true })
    await w.get('[aria-label="Clear"]').trigger('click')
    expect(w.emitted('update:modelValue').at(-1)[0]).toBeNull()
    expect(w.emitted('clear')).toBeTruthy()
  })

  it('does not open when disabled', async () => {
    const w = mountField({ modelValue: null, disabled: true })
    await w.get('button').trigger('click')
    await nextTick()
    expect(document.body.querySelector('[role="application"]')).toBeNull()
  })
})

describe('BaseDateField (density, readonly, datetime placeholder)', () => {
  it('compact density applies tw:gap-1 tw:px-2 to the trigger button', () => {
    const w = mountField({ modelValue: null, density: 'compact' })
    const btn = w.get('button[aria-haspopup="dialog"]')
    expect(btn.classes()).toContain('tw:gap-1')
    expect(btn.classes()).toContain('tw:px-2')
  })

  it('comfortable density applies tw:gap-2 tw:px-2.5 to the trigger button', () => {
    const w = mountField({ modelValue: null, density: 'comfortable' })
    const btn = w.get('button[aria-haspopup="dialog"]')
    expect(btn.classes()).toContain('tw:gap-2')
    expect(btn.classes()).toContain('tw:px-2.5')
  })

  it('readonly: does not open, sets aria-readonly, hides clear button', async () => {
    const w = mountField({ modelValue: DateTime.fromISO('2026-06-15'), readonly: true, clearable: true })
    const btn = w.get('button[aria-haspopup="dialog"]')
    await btn.trigger('click')
    await nextTick()
    expect(document.body.querySelector('[data-date-panel]')).toBeNull()
    expect(btn.attributes('aria-readonly')).toBe('true')
    expect(w.find('[aria-label="Clear"]').exists()).toBe(false)
  })

  it('emits focus and blur from the trigger button', async () => {
    const w = mountField({ modelValue: null })
    const btn = w.get('button[aria-haspopup="dialog"]')
    await btn.trigger('focus')
    await btn.trigger('blur')
    expect(w.emitted('focus')).toHaveLength(1)
    expect(w.emitted('blur')).toHaveLength(1)
  })

  it('datetime manual-input has placeholder "yyyy-mm-dd hh:mm"', async () => {
    const w = mountField({ modelValue: null, mode: 'datetime' })
    await w.get('button[aria-haspopup="dialog"]').trigger('click')
    await nextTick()
    const input = document.body.querySelector('[data-date-panel] input[type="text"]')
    expect(input).not.toBeNull()
    expect(input.getAttribute('placeholder')).toBe('yyyy-mm-dd hh:mm')
  })
})

describe('BaseDateField (range + multiple + presets)', () => {
  it('range: first click stays open (partial); second click emits {start,end} and closes', async () => {
    // Use a modelValue that puts the calendar on June 2026
    const w = mountField({
      mode: 'range',
      modelValue: { start: DateTime.fromISO('2026-06-10'), end: DateTime.fromISO('2026-06-14') },
    })
    await w.get('button[aria-haspopup="dialog"]').trigger('click')
    await nextTick()
    // First click: BaseCalendar sets rangeStart internally and emits {start, end: null} — panel stays open
    const day10 = document.body.querySelector('[data-day="2026-06-10"]')
    expect(day10).not.toBeNull()
    day10.click()
    await nextTick()
    expect(document.body.querySelector('[data-date-panel]')).not.toBeNull()
    // Second click: completes the range → panel closes
    const day17 = document.body.querySelector('[data-day="2026-06-17"]')
    expect(day17).not.toBeNull()
    day17.click()
    await nextTick()
    expect(document.body.querySelector('[data-date-panel]')).toBeNull()
    const emitted = w.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const lastValue = emitted.at(-1)[0]
    expect(lastValue).toHaveProperty('start')
    expect(lastValue).toHaveProperty('end')
    expect(DateTime.isDateTime(lastValue.start)).toBe(true)
    expect(DateTime.isDateTime(lastValue.end)).toBe(true)
    expect(lastValue.start.toMillis()).toBeLessThanOrEqual(lastValue.end.toMillis())
  })

  it('range clear: emits {start: null, end: null}', async () => {
    const w = mountField({
      mode: 'range',
      modelValue: { start: DateTime.fromISO('2026-06-10'), end: DateTime.fromISO('2026-06-14') },
      clearable: true,
    })
    await w.get('[aria-label="Clear"]').trigger('click')
    const emitted = w.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const lastValue = emitted.at(-1)[0]
    expect(lastValue).toEqual({ start: null, end: null })
  })

  it('multiple mode: picking a day stays open and emits an array of length 1', async () => {
    const w = mountField({ multiple: true, modelValue: [] })
    await w.get('button[aria-haspopup="dialog"]').trigger('click')
    await nextTick()
    // Pick any visible day
    const anyDay = document.body.querySelector('[data-day]')
    expect(anyDay).not.toBeNull()
    anyDay.click()
    await nextTick()
    // Panel must still be open for multiple mode
    expect(document.body.querySelector('[data-date-panel]')).not.toBeNull()
    const emitted = w.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const lastValue = emitted.at(-1)[0]
    expect(Array.isArray(lastValue)).toBe(true)
    expect(lastValue.length).toBe(1)
  })

  it('preset pick (range): clicking "Last 7 Days" emits a valid {start,end} and closes', async () => {
    const w = mountField({
      mode: 'range',
      modelValue: { start: null, end: null },
    })
    await w.get('button[aria-haspopup="dialog"]').trigger('click')
    await nextTick()
    // Find the preset rail button by text
    const presetBtns = document.body.querySelectorAll('[data-date-panel] button')
    const last7Btn = Array.from(presetBtns).find((b) => b.textContent.trim() === 'Last 7 Days')
    expect(last7Btn).not.toBeNull()
    last7Btn.click()
    await nextTick()
    // Panel should close after preset pick
    expect(document.body.querySelector('[data-date-panel]')).toBeNull()
    const emitted = w.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const lastValue = emitted.at(-1)[0]
    expect(lastValue).toHaveProperty('start')
    expect(lastValue).toHaveProperty('end')
    expect(DateTime.isDateTime(lastValue.start)).toBe(true)
    expect(DateTime.isDateTime(lastValue.end)).toBe(true)
    expect(lastValue.start.toMillis()).toBeLessThanOrEqual(lastValue.end.toMillis())
  })
})

describe('BaseDateField (time / datetime)', () => {
  it('time mode renders hour/minute/meridiem selects and emits a DateTime', async () => {
    const w = mountField({ mode: 'time', modelValue: null })
    await w.get('button').trigger('click')
    await nextTick()
    const selects = document.body.querySelectorAll('[data-date-panel] select')
    expect(selects.length).toBe(3) // hours, minutes, am/pm
    selects[0].value = '9'
    selects[0].dispatchEvent(new Event('change'))
    await nextTick()
    const v = w.emitted('update:modelValue').at(-1)[0]
    expect(DateTime.isDateTime(v)).toBe(true)
    expect(v.hour).toBe(9)
  })

  it('datetime mode keeps the day and updates the time', async () => {
    const day = DateTime.fromISO('2026-06-15T00:00')
    const w = mountField({ mode: 'datetime', modelValue: day })
    await w.get('button').trigger('click')
    await nextTick()
    const selects = document.body.querySelectorAll('[data-date-panel] select')
    selects[0].value = '10'
    selects[0].dispatchEvent(new Event('change'))
    await nextTick()
    const v = w.emitted('update:modelValue').at(-1)[0]
    expect(v.toISODate()).toBe('2026-06-15')
    expect(v.hour).toBe(10)
  })

  it('datetime mode preserves time-of-day when picking a calendar day', async () => {
    const w = mountField({
      mode: 'datetime',
      modelValue: DateTime.fromISO('2026-06-15T14:30'),
    })
    await w.get('button').trigger('click')
    await nextTick()
    const dayCell = document.body.querySelector('[data-day="2026-06-20"]')
    expect(dayCell).not.toBeNull()
    dayCell.click()
    await nextTick()
    const v = w.emitted('update:modelValue').at(-1)[0]
    expect(v.toISODate()).toBe('2026-06-20')
    expect(v.hour).toBe(14)
    expect(v.minute).toBe(30)
  })
})
