import { describe, it, expect } from 'vitest'
import { fuzzyScore, filterCommands, groupCommands } from './commandHelpers.js'

describe('fuzzyScore', () => {
  it('empty query matches everything', () => {
    expect(fuzzyScore('', 'anything')).toBe(1)
  })
  it('substring outranks subsequence, earlier outranks later', () => {
    expect(fuzzyScore('cap', 'CAPAs')).toBeGreaterThan(fuzzyScore('cap', 'Recap notes'))
    expect(fuzzyScore('cap', 'CAPAs')).toBeGreaterThan(fuzzyScore('cps', 'CAPAs')) // substring > subsequence
  })
  it('subsequence matches; non-subsequence does not', () => {
    expect(fuzzyScore('cps', 'CAPAs')).toBeGreaterThan(0)
    expect(fuzzyScore('xyz', 'CAPAs')).toBe(0)
  })
})

describe('filterCommands', () => {
  const cmds = [
    { id: 'a', title: 'CAPAs', group: 'Navigate' },
    { id: 'b', title: 'Documents', group: 'Navigate', keywords: ['files'] },
    { id: 'c', title: 'Create nonconformance', group: 'Actions' },
  ]
  it('returns all (capped) for an empty query', () => {
    expect(filterCommands(cmds, '').map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })
  it('ranks matches best-first and drops non-matches', () => {
    const r = filterCommands(cmds, 'doc')
    expect(r.map((c) => c.id)).toEqual(['b'])
  })
  it('matches via keywords', () => {
    expect(filterCommands(cmds, 'files').map((c) => c.id)).toEqual(['b'])
  })
  it('respects the limit', () => {
    expect(filterCommands(cmds, '', { limit: 2 })).toHaveLength(2)
  })
})

describe('groupCommands', () => {
  it('groups by group, preserving first-seen order', () => {
    const grouped = groupCommands([
      { id: 'a', title: 'X', group: 'Navigate' },
      { id: 'b', title: 'Y', group: 'Actions' },
      { id: 'c', title: 'Z', group: 'Navigate' },
    ])
    expect(grouped.map((g) => g.group)).toEqual(['Navigate', 'Actions'])
    expect(grouped[0].items.map((c) => c.id)).toEqual(['a', 'c'])
  })
})
