import { DateTime } from 'luxon'

/**
 * Due-window presets for the task inbox — "show me what lands in the next N
 * days". Pure (no Vue, injectable `now`) so the predicate is unit-testable and
 * so a window stays DYNAMIC: the stored value is a preset id, never a frozen
 * pair of dates, and it re-resolves on every filter run. A tab left open
 * overnight therefore rolls to the new day instead of quietly filtering on
 * yesterday's boundary.
 *
 * ── Semantics, chosen deliberately ──────────────────────────────────────────
 * A window is a DEADLINE CUTOFF, not a slice: "Due in 7 days" means due on or
 * before today + 7, INCLUDING anything already overdue. The alternative
 * (start = today) hides the late work from the very filter a supervisor opens
 * to chase deadlines, which is exactly backwards — the most urgent rows would
 * be the ones missing. `overdue` isolates the late tail when that is the
 * question being asked.
 *
 * Tasks with NO due date never match an active window. They are not "due
 * within" anything, and folding them in would make every window an
 * ever-growing catch-all.
 */

/** Preset catalogue. `days` is the cutoff offset; absent for overdue/custom. */
export const DUE_WINDOWS = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'd7', label: 'Due in 7 days', days: 7 },
  { id: 'd15', label: 'Due in 15 days', days: 15 },
  { id: 'd30', label: 'Due in 30 days', days: 30 },
  { id: 'd60', label: 'Due in 60 days', days: 60 },
  { id: 'custom', label: 'Custom range…' },
]

const BY_ID = Object.fromEntries(DUE_WINDOWS.map((w) => [w.id, w]))

/** Coerce DateTime | ISO string | null → DateTime | null. */
function toDateTime(v) {
  if (!v) return null
  if (DateTime.isDateTime(v)) return v.isValid ? v : null
  const dt = DateTime.fromISO(String(v))
  return dt.isValid ? dt : null
}

/**
 * Resolve a stored window value to `{ start, end }` (either bound may be null =
 * unbounded). Returns null when no window is active or the id is unknown.
 *
 * @param {{id: string, from?: string, to?: string}|null} value
 * @param {DateTime} [now]
 */
export function resolveDueWindow(value, now = DateTime.now()) {
  const preset = value?.id ? BY_ID[value.id] : null
  if (!preset) return null

  if (preset.id === 'overdue') {
    // Strictly before today — a task due today is due, not late.
    return { start: null, end: now.startOf('day').minus({ milliseconds: 1 }) }
  }

  if (preset.id === 'custom') {
    const from = toDateTime(value.from)
    const to = toDateTime(value.to)
    if (!from && !to) return null
    return { start: from ? from.startOf('day') : null, end: to ? to.endOf('day') : null }
  }

  return { start: null, end: now.plus({ days: preset.days }).endOf('day') }
}

/** True when `value` names a window that actually constrains anything. */
export function isDueWindowActive(value, now = DateTime.now()) {
  return resolveDueWindow(value, now) !== null
}

/**
 * Apply a window to one due date. An inactive window passes everything; an
 * active one rejects rows with no due date (see the header).
 *
 * @param {DateTime|string|null} dueDate
 * @param {{id: string, from?: string, to?: string}|null} value
 * @param {DateTime} [now]
 */
export function matchesDueWindow(dueDate, value, now = DateTime.now()) {
  const window = resolveDueWindow(value, now)
  if (!window) return true
  const d = toDateTime(dueDate)
  if (!d) return false
  const ms = d.toMillis()
  if (window.start && ms < window.start.toMillis()) return false
  if (window.end && ms > window.end.toMillis()) return false
  return true
}

/** Short human label for the active window (chips, export headers, tests). */
export function dueWindowLabel(value) {
  const preset = value?.id ? BY_ID[value.id] : null
  if (!preset) return ''
  if (preset.id !== 'custom') return preset.label
  const from = toDateTime(value.from)
  const to = toDateTime(value.to)
  if (from && to) return `Due ${from.toFormat('LLL d')} – ${to.toFormat('LLL d, yyyy')}`
  if (to) return `Due on or before ${to.toFormat('LLL d, yyyy')}`
  if (from) return `Due on or after ${from.toFormat('LLL d, yyyy')}`
  return preset.label
}
