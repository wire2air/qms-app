/**
 * Structured filter model + evaluation for the data table (Layer 1 logic).
 *
 * A FilterGroup is `{ combinator: 'and' | 'or', conditions: Condition[] }`.
 * A Condition is `{ id, field, operator, value }`.
 *
 * Pure functions — no Vue, no engine — so the matching rules are unit-testable in
 * isolation. The UI (TableFilters/TableFilterChip) and DataTable consume these.
 */
import { getCellValue } from './useDataTable.js'

// Operator catalogue per filter type. `input` tells the UI what control to show.
export const OPERATORS = {
  text: [
    { value: 'contains', label: 'contains', input: 'text' },
    { value: 'notContains', label: 'does not contain', input: 'text' },
    { value: 'equals', label: 'is', input: 'text' },
    { value: 'notEquals', label: 'is not', input: 'text' },
    { value: 'startsWith', label: 'starts with', input: 'text' },
    { value: 'endsWith', label: 'ends with', input: 'text' },
    { value: 'isEmpty', label: 'is empty', input: 'none' },
    { value: 'isNotEmpty', label: 'is not empty', input: 'none' },
  ],
  number: [
    { value: 'eq', label: '=', input: 'number' },
    { value: 'neq', label: '≠', input: 'number' },
    { value: 'gt', label: '>', input: 'number' },
    { value: 'gte', label: '≥', input: 'number' },
    { value: 'lt', label: '<', input: 'number' },
    { value: 'lte', label: '≤', input: 'number' },
    { value: 'isEmpty', label: 'is empty', input: 'none' },
    { value: 'isNotEmpty', label: 'is not empty', input: 'none' },
  ],
  select: [
    { value: 'is', label: 'is', input: 'select' },
    { value: 'isNot', label: 'is not', input: 'select' },
    { value: 'isAnyOf', label: 'is any of', input: 'multiselect' },
    { value: 'isNoneOf', label: 'is none of', input: 'multiselect' },
  ],
  boolean: [{ value: 'is', label: 'is', input: 'boolean' }],
  date: [
    { value: 'on', label: 'on', input: 'date' },
    { value: 'before', label: 'before', input: 'date' },
    { value: 'after', label: 'after', input: 'date' },
    { value: 'isEmpty', label: 'is empty', input: 'none' },
    { value: 'isNotEmpty', label: 'is not empty', input: 'none' },
  ],
}

export function operatorsFor(filterType) {
  return OPERATORS[filterType] || OPERATORS.text
}

export function operatorMeta(filterType, operator) {
  return operatorsFor(filterType).find((o) => o.value === operator) || null
}

/** Does this operator require a value input? (isEmpty/isNotEmpty do not.) */
export function operatorNeedsValue(filterType, operator) {
  const meta = operatorMeta(filterType, operator)
  return meta ? meta.input !== 'none' : true
}

let _cid = 0
export function newCondition(field, filterType) {
  const op = operatorsFor(filterType)[0]
  return { id: `fc_${++_cid}`, field, operator: op?.value ?? 'contains', value: null }
}

export function emptyGroup() {
  return { combinator: 'and', conditions: [] }
}

function asString(v) {
  return v == null ? '' : String(v)
}
function asMillis(v) {
  if (v == null) return null
  if (typeof v?.toMillis === 'function') return v.toMillis()
  const t = new Date(v).getTime()
  return Number.isNaN(t) ? null : t
}

/** Evaluate one condition against a resolved cell value. */
export function evaluateCondition(cellValue, condition) {
  const { operator, value } = condition
  const s = () => asString(cellValue).toLowerCase()
  const t = () => asString(value).toLowerCase()
  switch (operator) {
    case 'isEmpty':
      return cellValue == null || cellValue === ''
    case 'isNotEmpty':
      return !(cellValue == null || cellValue === '')
    case 'contains':
      return s().includes(t())
    case 'notContains':
      return !s().includes(t())
    case 'equals':
      return s() === t()
    case 'notEquals':
      return s() !== t()
    case 'startsWith':
      return s().startsWith(t())
    case 'endsWith':
      return s().endsWith(t())
    case 'eq':
      return Number(cellValue) === Number(value)
    case 'neq':
      return Number(cellValue) !== Number(value)
    case 'gt':
      return Number(cellValue) > Number(value)
    case 'gte':
      return Number(cellValue) >= Number(value)
    case 'lt':
      return Number(cellValue) < Number(value)
    case 'lte':
      return Number(cellValue) <= Number(value)
    case 'is':
      if (typeof value === 'boolean') return Boolean(cellValue) === value
      return asString(cellValue) === asString(value)
    case 'isNot':
      return asString(cellValue) !== asString(value)
    case 'isAnyOf':
      return Array.isArray(value) && value.map(asString).includes(asString(cellValue))
    case 'isNoneOf':
      return Array.isArray(value) && !value.map(asString).includes(asString(cellValue))
    case 'on': {
      const a = asMillis(cellValue)
      const b = asMillis(value)
      return a != null && b != null && new Date(a).toDateString() === new Date(b).toDateString()
    }
    case 'before': {
      const a = asMillis(cellValue)
      const b = asMillis(value)
      return a != null && b != null && a < b
    }
    case 'after': {
      const a = asMillis(cellValue)
      const b = asMillis(value)
      return a != null && b != null && a > b
    }
    default:
      return true
  }
}

/** A condition only filters once it's fully specified. */
export function isConditionActive(condition, filterType) {
  if (!condition?.field || !condition?.operator) return false
  if (!operatorNeedsValue(filterType, condition.operator)) return true
  const v = condition.value
  if (Array.isArray(v)) return v.length > 0
  return v != null && v !== ''
}

export function activeConditionCount(group, colByName) {
  if (!group?.conditions?.length) return 0
  return group.conditions.filter((c) =>
    isConditionActive(c, colByName?.[c.field]?.filterType || 'text'),
  ).length
}

/** Filter rows by the group. Inactive conditions are ignored. */
export function applyFilterGroup(rows, group, colByName) {
  if (!group?.conditions?.length) return rows
  const active = group.conditions.filter((c) =>
    isConditionActive(c, colByName?.[c.field]?.filterType || 'text'),
  )
  if (!active.length) return rows
  const or = group.combinator === 'or'
  return rows.filter((row) => {
    let acc = !or // and → start true; or → start false
    for (const c of active) {
      const col = colByName?.[c.field]
      const cellVal = col ? getCellValue(row, col) : row[c.field]
      const res = evaluateCondition(cellVal, c)
      acc = or ? acc || res : acc && res
      if (or && acc) break
      if (!or && !acc) break
    }
    return acc
  })
}
