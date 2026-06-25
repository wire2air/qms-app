import { describe, it, expect } from 'vitest'
import {
  evaluateCondition,
  isConditionActive,
  applyFilterGroup,
  operatorsFor,
  operatorNeedsValue,
  newCondition,
} from './filterModel.js'

describe('tableFilters — operators metadata', () => {
  it('returns type-specific operators and falls back to text', () => {
    expect(operatorsFor('number')[0].value).toBe('eq')
    expect(operatorsFor('unknown')).toBe(operatorsFor('text'))
  })
  it('knows which operators need a value', () => {
    expect(operatorNeedsValue('text', 'contains')).toBe(true)
    expect(operatorNeedsValue('text', 'isEmpty')).toBe(false)
  })
  it('seeds a condition with the first operator for the type', () => {
    expect(newCondition('age', 'number').operator).toBe('eq')
  })
})

describe('tableFilters — evaluateCondition', () => {
  it('text operators', () => {
    expect(evaluateCondition('Hello World', { operator: 'contains', value: 'world' })).toBe(true)
    expect(evaluateCondition('Hello', { operator: 'notContains', value: 'x' })).toBe(true)
    expect(evaluateCondition('abc', { operator: 'startsWith', value: 'ab' })).toBe(true)
    expect(evaluateCondition('abc', { operator: 'endsWith', value: 'bc' })).toBe(true)
    expect(evaluateCondition('abc', { operator: 'equals', value: 'ABC' })).toBe(true)
  })
  it('empty / not-empty', () => {
    expect(evaluateCondition(null, { operator: 'isEmpty' })).toBe(true)
    expect(evaluateCondition('', { operator: 'isEmpty' })).toBe(true)
    expect(evaluateCondition('x', { operator: 'isNotEmpty' })).toBe(true)
  })
  it('number operators', () => {
    expect(evaluateCondition(5, { operator: 'gt', value: 3 })).toBe(true)
    expect(evaluateCondition(5, { operator: 'lte', value: 5 })).toBe(true)
    expect(evaluateCondition(5, { operator: 'neq', value: 4 })).toBe(true)
  })
  it('select / boolean', () => {
    expect(evaluateCondition('OPEN', { operator: 'is', value: 'OPEN' })).toBe(true)
    expect(evaluateCondition('OPEN', { operator: 'isAnyOf', value: ['OPEN', 'CLOSED'] })).toBe(true)
    expect(evaluateCondition('DONE', { operator: 'isNoneOf', value: ['OPEN'] })).toBe(true)
    expect(evaluateCondition(true, { operator: 'is', value: true })).toBe(true)
  })
  it('date operators via millis (supports luxon-like toMillis)', () => {
    const dt = (ms) => ({ toMillis: () => ms })
    const day = 86400000
    expect(evaluateCondition(dt(2 * day), { operator: 'before', value: dt(3 * day) })).toBe(true)
    expect(evaluateCondition(dt(5 * day), { operator: 'after', value: dt(3 * day) })).toBe(true)
  })
})

describe('tableFilters — isConditionActive', () => {
  it('needs a value for value-operators, not for empty-operators', () => {
    expect(isConditionActive({ field: 'a', operator: 'contains', value: '' }, 'text')).toBe(false)
    expect(isConditionActive({ field: 'a', operator: 'contains', value: 'x' }, 'text')).toBe(true)
    expect(isConditionActive({ field: 'a', operator: 'isEmpty' }, 'text')).toBe(true)
    expect(isConditionActive({ field: 'a', operator: 'isAnyOf', value: [] }, 'select')).toBe(false)
  })
})

describe('tableFilters — applyFilterGroup', () => {
  const colByName = {
    name: { name: 'name', field: 'name', filterType: 'text' },
    count: { name: 'count', field: 'count', filterType: 'number' },
    site: { name: 'site', field: (r) => r.site?.name, filterType: 'text' },
  }
  const rows = [
    { id: 1, name: 'Alpha', count: 3, site: { name: 'London' } },
    { id: 2, name: 'Beta', count: 12, site: { name: 'Paris' } },
    { id: 3, name: 'Gamma', count: 7, site: { name: 'London' } },
  ]

  it('returns all rows when there are no active conditions', () => {
    expect(applyFilterGroup(rows, { combinator: 'and', conditions: [] }, colByName)).toHaveLength(3)
    expect(
      applyFilterGroup(
        rows,
        { combinator: 'and', conditions: [{ field: 'name', operator: 'contains', value: '' }] },
        colByName,
      ),
    ).toHaveLength(3)
  })

  it('AND combines conditions', () => {
    const group = {
      combinator: 'and',
      conditions: [
        { field: 'site', operator: 'equals', value: 'London' },
        { field: 'count', operator: 'gt', value: 5 },
      ],
    }
    const out = applyFilterGroup(rows, group, colByName)
    expect(out.map((r) => r.id)).toEqual([3]) // London AND count>5
  })

  it('OR combines conditions', () => {
    const group = {
      combinator: 'or',
      conditions: [
        { field: 'name', operator: 'equals', value: 'Alpha' },
        { field: 'count', operator: 'gt', value: 10 },
      ],
    }
    const out = applyFilterGroup(rows, group, colByName)
    expect(out.map((r) => r.id).sort()).toEqual([1, 2])
  })

  it('resolves accessor-function columns', () => {
    const group = {
      combinator: 'and',
      conditions: [{ field: 'site', operator: 'contains', value: 'lon' }],
    }
    expect(applyFilterGroup(rows, group, colByName).map((r) => r.id).sort()).toEqual([1, 3])
  })
})
