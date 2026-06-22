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
  { id: 'today', label: 'Today', range: (n) => ({ start: dayStart(n), end: dayEnd(n) }) },
  {
    id: 'yesterday',
    label: 'Yesterday',
    range: (n) => {
      const d = n.minus({ days: 1 })
      return { start: dayStart(d), end: dayEnd(d) }
    },
  },
  {
    id: 'last_7_days',
    label: 'Last 7 Days',
    range: (n) => ({ start: dayStart(n.minus({ days: 6 })), end: dayEnd(n) }),
  },
  {
    id: 'last_30_days',
    label: 'Last 30 Days',
    range: (n) => ({ start: dayStart(n.minus({ days: 29 })), end: dayEnd(n) }),
  },
  {
    id: 'this_month',
    label: 'This Month',
    range: (n) => ({ start: n.startOf('month'), end: n.endOf('month') }),
  },
  {
    id: 'last_month',
    label: 'Last Month',
    range: (n) => {
      const d = n.minus({ months: 1 })
      return { start: d.startOf('month'), end: d.endOf('month') }
    },
  },
  {
    id: 'this_quarter',
    label: 'This Quarter',
    range: (n) => ({ start: n.startOf('quarter'), end: n.endOf('quarter') }),
  },
  {
    id: 'last_quarter',
    label: 'Last Quarter',
    range: (n) => {
      const d = n.minus({ quarters: 1 })
      return { start: d.startOf('quarter'), end: d.endOf('quarter') }
    },
  },
  {
    id: 'this_year',
    label: 'This Year',
    range: (n) => ({ start: n.startOf('year'), end: n.endOf('year') }),
  },
  {
    id: 'last_year',
    label: 'Last Year',
    range: (n) => {
      const d = n.minus({ years: 1 })
      return { start: d.startOf('year'), end: d.endOf('year') }
    },
  },
  { id: 'custom', label: 'Custom', range: () => null },
]

/** Resolve a preset id to a concrete `{ start, end }`; null if unknown or custom. */
export function resolvePreset(id, now = DateTime.now()) {
  const preset = PRESETS.find((p) => p.id === id)
  if (!preset) return null
  return preset.range(now)
}
