import { describe, it, expect } from 'vitest'
import {
  hasChildren,
  isAsync,
  resolveChildren,
  isChecked,
  toggleSelection,
  searchNodes,
  countActiveGroups,
  shouldSearch,
  isDateNode,
} from './filterMenuHelpers.js'

describe('hasChildren / isAsync', () => {
  it('detects submenus and async children', () => {
    expect(hasChildren({ children: [] })).toBe(true)
    expect(hasChildren({ options: [{ value: 'a', label: 'A' }] })).toBe(true)
    expect(hasChildren({ value: 'x' })).toBe(false)
    expect(isAsync({ children: () => Promise.resolve([]) })).toBe(true)
    expect(isAsync({ children: [] })).toBe(false)
  })
})

describe('resolveChildren', () => {
  it('expands the options shorthand into selectable leaves', () => {
    const node = { group: 'statusId', select: 'check', options: [{ value: 'OPEN', label: 'Open', count: 3 }] }
    expect(resolveChildren(node)).toEqual([
      { id: 'statusId:OPEN', label: 'Open', value: 'OPEN', group: 'statusId', select: 'check', icon: undefined, count: 3 },
    ])
  })
  it('passes explicit children through', () => {
    const kids = [{ id: 'a', label: 'A' }]
    expect(resolveChildren({ children: kids })).toBe(kids)
  })
})

describe('isChecked / toggleSelection', () => {
  it('multi-select toggles into an array', () => {
    let m = {}
    m = toggleSelection(m, { group: 'statusId', value: 'OPEN' })
    expect(m.statusId).toEqual(['OPEN'])
    expect(isChecked(m, 'statusId', 'OPEN')).toBe(true)
    m = toggleSelection(m, { group: 'statusId', value: 'OPEN' })
    expect(m.statusId).toEqual([])
    expect(isChecked(m, 'statusId', 'OPEN')).toBe(false)
  })
  it('radio sets a single value (and clears on re-toggle)', () => {
    let m = toggleSelection({}, { group: 'sort', value: 'date', select: 'radio' })
    expect(m.sort).toBe('date')
    expect(isChecked(m, 'sort', 'date', 'radio')).toBe(true)
    m = toggleSelection(m, { group: 'sort', value: 'date', select: 'radio' })
    expect(m.sort).toBeNull()
  })
  it('does not mutate the input model', () => {
    const m = { statusId: ['OPEN'] }
    const next = toggleSelection(m, { group: 'statusId', value: 'CLOSED' })
    expect(m.statusId).toEqual(['OPEN'])
    expect(next.statusId).toEqual(['OPEN', 'CLOSED'])
  })
})

describe('searchNodes', () => {
  const nodes = [
    { id: 'a', label: 'Open' },
    { id: 'b', label: 'Closed' },
    { type: 'divider' },
  ]
  it('filters by label, keeping structural nodes', () => {
    const r = searchNodes(nodes, 'clos')
    expect(r.map((n) => n.id || n.type)).toEqual(['b', 'divider'])
  })
  it('returns all for an empty query', () => {
    expect(searchNodes(nodes, '')).toHaveLength(3)
  })
})

describe('countActiveGroups', () => {
  it('counts buckets with a value', () => {
    expect(countActiveGroups({ statusId: ['A'], severityId: [], owner: 'u1', q: '' })).toBe(2)
  })
})

describe('shouldSearch', () => {
  it('auto-enables past the threshold and respects explicit flags', () => {
    expect(shouldSearch({}, 20)).toBe(true)
    expect(shouldSearch({}, 3)).toBe(false)
    expect(shouldSearch({ searchable: true }, 1)).toBe(true)
    expect(shouldSearch({ searchable: false }, 100)).toBe(false)
  })
})

describe('date nodes', () => {
  it('isDateNode detects type:date', () => {
    expect(isDateNode({ type: 'date', group: 'createdAt' })).toBe(true)
    expect(isDateNode({ group: 'statusId', options: [] })).toBe(false)
  })
  it('countActiveGroups counts a non-null date token', () => {
    expect(countActiveGroups({ createdAt: { operator: 'before', value: '2026-01-01' } })).toBe(1)
    expect(countActiveGroups({ createdAt: null })).toBe(0)
  })
})
