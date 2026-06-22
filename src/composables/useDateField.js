import { computed } from 'vue'
import { DateTime } from 'luxon'

/**
 * Headless logic for BaseDateField — keeps parsing/normalisation out of the
 * component so it is unit-testable and shared with BaseDateFilter.
 *
 * `mode`        : 'date' | 'datetime' | 'time' | 'range' | 'month' | 'year'
 * `valueFormat` : 'datetime' (luxon DateTime, default) | 'iso' (string)
 */

/** Internal DateTime → emitted model value. */
export function toModel(dt, mode, valueFormat = 'datetime') {
  if (!dt) return null
  if (valueFormat !== 'iso') return dt
  if (mode === 'time') return dt.toFormat('HH:mm')
  if (mode === 'datetime') return dt.toISO()
  return dt.toISODate() // date | month | year
}

/** Incoming model value → internal DateTime. */
export function fromModel(value, mode, valueFormat = 'datetime') {
  if (!value) return null
  if (DateTime.isDateTime(value)) return value.isValid ? value : null
  if (valueFormat === 'iso') {
    if (mode === 'time') {
      const dt = DateTime.fromFormat(String(value), 'HH:mm')
      return dt.isValid ? dt : null
    }
    const dt = DateTime.fromISO(String(value))
    return dt.isValid ? dt : null
  }
  const dt = DateTime.fromISO(String(value))
  return dt.isValid ? dt : null
}

const DATE_FORMATS = ['yyyy-MM-dd', 'MM/dd/yyyy', 'M/d/yyyy', 'LLL d, yyyy']
const TIME_FORMATS = ['HH:mm', 'h:mm a', 'h:mma']

/** Lenient parse of typed text into a DateTime, or null. */
export function parseManual(text, mode) {
  const t = (text || '').trim()
  if (!t) return null
  const formats = mode === 'time' ? TIME_FORMATS : DATE_FORMATS
  for (const f of formats) {
    const dt = DateTime.fromFormat(t, f)
    if (dt.isValid) return dt
  }
  const iso = DateTime.fromISO(t)
  return iso.isValid ? iso : null
}

/** Trigger display text. */
export function formatField(dt, mode, displayFormat) {
  if (!dt) return ''
  if (displayFormat) return dt.toFormat(displayFormat)
  if (mode === 'time') return dt.toFormat('h:mm a')
  return dt.formatDate(mode === 'datetime' ? 'datetime' : 'date')
}

/**
 * Composable used by BaseDateField. `opts` is a reactive bag of getters:
 *   { model, mode, valueFormat, displayFormat }
 * Returns the internal DateTime ref + commit/clear that write back through
 * toModel so the field component stays declarative.
 */
export function useDateField(opts) {
  const internal = computed(() => fromModel(opts.model.value, opts.mode.value, opts.valueFormat.value))
  const displayText = computed(() =>
    formatField(internal.value, opts.mode.value, opts.displayFormat?.value),
  )
  function commit(dt) {
    opts.model.value = toModel(dt, opts.mode.value, opts.valueFormat.value)
  }
  function clear() {
    opts.model.value = null
  }
  return { internal, displayText, commit, clear }
}
