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
