import { DateTime } from 'luxon'

/**
 * Pure date-range resolvers shared by BaseDateField (presets) and BaseDateFilter
 * (relative tokens / operators). No Vue. `now` is injectable for deterministic
 * tests; defaults to DateTime.now().
 *
 * A resolved range is always `{ start: DateTime, end: DateTime }` with `start`
 * at startOf('day') and `end` at endOf('day') (inclusive window).
 */

function dayStart(dt) {
  return dt.startOf('day')
}
function dayEnd(dt) {
  return dt.endOf('day')
}

/** Preset descriptors. `range(now)` returns null for the open-ended Custom row. */
export const PRESETS = [
  { id: 'today', label: 'Today', range(n) { return { start: dayStart(n), end: dayEnd(n) } } },
  {
    id: 'yesterday',
    label: 'Yesterday',
    range(n) {
      const d = n.minus({ days: 1 })
      return { start: dayStart(d), end: dayEnd(d) }
    },
  },
  {
    id: 'last_7_days',
    label: 'Last 7 Days',
    range(n) { return { start: dayStart(n.minus({ days: 6 })), end: dayEnd(n) } },
  },
  {
    id: 'last_30_days',
    label: 'Last 30 Days',
    range(n) { return { start: dayStart(n.minus({ days: 29 })), end: dayEnd(n) } },
  },
  {
    id: 'this_month',
    label: 'This Month',
    range(n) { return { start: n.startOf('month'), end: n.endOf('month') } },
  },
  {
    id: 'last_month',
    label: 'Last Month',
    range(n) {
      const d = n.minus({ months: 1 })
      return { start: d.startOf('month'), end: d.endOf('month') }
    },
  },
  {
    id: 'this_quarter',
    label: 'This Quarter',
    range(n) { return { start: n.startOf('quarter'), end: n.endOf('quarter') } },
  },
  {
    id: 'last_quarter',
    label: 'Last Quarter',
    range(n) {
      const d = n.minus({ quarters: 1 })
      return { start: d.startOf('quarter'), end: d.endOf('quarter') }
    },
  },
  {
    id: 'this_year',
    label: 'This Year',
    range(n) { return { start: n.startOf('year'), end: n.endOf('year') } },
  },
  {
    id: 'last_year',
    label: 'Last Year',
    range(n) {
      const d = n.minus({ years: 1 })
      return { start: d.startOf('year'), end: d.endOf('year') }
    },
  },
  { id: 'custom', label: 'Custom', range() { return null } },
]

/** Resolve a preset id to a concrete `{ start, end }`; null if unknown or custom. */
export function resolvePreset(id, now = DateTime.now()) {
  const preset = PRESETS.find((p) => p.id === id)
  if (!preset) return null
  return preset.range(now)
}

/** Operator catalogue for the advanced-filter editor (id + display label). */
export const OPERATORS = [
  { id: 'eq', label: 'Equals' },
  { id: 'neq', label: 'Not equals' },
  { id: 'before', label: 'Before' },
  { id: 'after', label: 'After' },
  { id: 'onBefore', label: 'On or before' },
  { id: 'onAfter', label: 'On or after' },
  { id: 'between', label: 'Between' },
  { id: 'notBetween', label: 'Not between' },
  { id: 'empty', label: 'Is empty' },
  { id: 'notEmpty', label: 'Is not empty' },
  { id: 'relative', label: 'Relative' },
]

/** Derive the set of known operator ids from OPERATORS for fast lookup. */
const KNOWN_OPERATORS = new Set(OPERATORS.map((o) => o.id))

/** Coerce DateTime | ISO string | null → DateTime | null. */
function toDateTime(v) {
  if (!v) return null
  if (DateTime.isDateTime(v)) return v.isValid ? v : null
  const dt = DateTime.fromISO(String(v))
  return dt.isValid ? dt : null
}

/**
 * Resolve a relative token to `{ start, end }`.
 *  - dir 'past': window of `count` `unit`s ending today (inclusive)
 *  - dir 'next': window of `count` `unit`s starting today (inclusive)
 *  - dir 'this': the current calendar `unit`
 */
export function resolveRelative({ dir, unit, count = 1 } = {}, now = DateTime.now()) {
  if (dir === 'this') {
    return { start: now.startOf(unit), end: now.endOf(unit) }
  }
  if (dir === 'next') {
    return { start: now.startOf('day'), end: now.plus({ [`${unit}s`]: count - 1 }).endOf('day') }
  }
  // 'past' (default)
  return { start: now.minus({ [`${unit}s`]: count - 1 }).startOf('day'), end: now.endOf('day') }
}

/**
 * Resolve a filter token to a `{ start, end }` window (either bound may be null
 * = unbounded). Boundary semantics: before/after are exclusive of the boundary
 * DAY; onBefore/onAfter and between are inclusive. empty/notEmpty/neq/notBetween
 * return an open window — use matchesDateFilter for the actual predicate.
 */
export function resolveDateFilter(token, now = DateTime.now()) {
  if (!token || !token.operator) return { start: null, end: null }
  const a = toDateTime(token.value)
  const b = toDateTime(token.value2)
  switch (token.operator) {
    case 'eq':
      return a ? { start: a.startOf('day'), end: a.endOf('day') } : { start: null, end: null }
    case 'before':
      return { start: null, end: a ? a.startOf('day').minus({ milliseconds: 1 }) : null }
    case 'onBefore':
      return { start: null, end: a ? a.endOf('day') : null }
    case 'after':
      return { start: a ? a.endOf('day').plus({ milliseconds: 1 }) : null, end: null }
    case 'onAfter':
      return { start: a ? a.startOf('day') : null, end: null }
    case 'between':
      return { start: a ? a.startOf('day') : null, end: b ? b.endOf('day') : null }
    case 'relative':
      return resolveRelative(token.relative, now)
    default:
      return { start: null, end: null }
  }
}

/** Apply a token to a single date. Returns true when the date passes the filter. */
export function matchesDateFilter(date, token, now = DateTime.now()) {
  if (!token || !token.operator) return true
  if (!KNOWN_OPERATORS.has(token.operator)) return false
  const d = toDateTime(date)
  if (token.operator === 'empty') return d == null
  if (token.operator === 'notEmpty') return d != null
  if (d == null) return false
  const ms = d.toMillis()

  if (token.operator === 'neq') {
    const a = toDateTime(token.value)
    if (!a) return true
    return !(ms >= a.startOf('day').toMillis() && ms <= a.endOf('day').toMillis())
  }
  if (token.operator === 'notBetween') {
    const a = toDateTime(token.value)
    const b = toDateTime(token.value2)
    const lo = a ? a.startOf('day').toMillis() : -Infinity
    const hi = b ? b.endOf('day').toMillis() : Infinity
    return !(ms >= lo && ms <= hi)
  }
  const { start, end } = resolveDateFilter(token, now)
  if (start && ms < start.toMillis()) return false
  if (end && ms > end.toMillis()) return false
  return true
}
