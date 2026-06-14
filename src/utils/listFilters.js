import { DateTime } from 'luxon'

/**
 * True when `value` (a luxon DateTime or ISO string) falls within the inclusive
 * [from, to] range. `from`/`to` are 'yyyy-mm-dd' strings; empty = unbounded on
 * that side. Used by the list date-range filters (created-date basis).
 */
export function dateInRange(value, from, to) {
  if (!from && !to) return true
  const ms = value?.toMillis?.() ?? (value ? DateTime.fromISO(String(value)).toMillis() : 0)
  if (!ms) return false
  if (from && ms < DateTime.fromISO(from).startOf('day').toMillis()) return false
  if (to && ms > DateTime.fromISO(to).endOf('day').toMillis()) return false
  return true
}
