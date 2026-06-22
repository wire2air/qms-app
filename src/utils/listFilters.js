import { matchesDateFilter } from './dateRanges.js'

/**
 * True when `value` (a luxon DateTime or ISO string) falls within the inclusive
 * [from, to] range. `from`/`to` are 'yyyy-mm-dd' strings; empty = unbounded.
 * Thin compatibility wrapper over matchesDateFilter (single filtering impl).
 */
export function dateInRange(value, from, to) {
  if (!from && !to) return true
  return matchesDateFilter(value, { operator: 'between', value: from || null, value2: to || null })
}
