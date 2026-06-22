import { describe, it, expect } from 'vitest'
import {
  resolveListState,
  filtersToQuery,
  queryToFilters,
  encodeSort,
  decodeSort,
} from './listLayoutHelpers.js'

describe('resolveListState', () => {
  it('prefers loading over everything', () => {
    expect(resolveListState({ loading: true, error: true, empty: true })).toBe('loading')
  })
  it('error before empty', () => {
    expect(resolveListState({ error: true, empty: true })).toBe('error')
  })
  it('empty before ready', () => {
    expect(resolveListState({ empty: true })).toBe('empty')
  })
  it('defaults to ready', () => {
    expect(resolveListState({})).toBe('ready')
  })
})

describe('filtersToQuery', () => {
  const defaults = { search: '', statusId: null, siteIds: [], page: 1 }

  it('omits values equal to their default', () => {
    expect(filtersToQuery({ ...defaults }, defaults)).toEqual({})
  })
  it('serializes changed scalars to strings', () => {
    expect(filtersToQuery({ ...defaults, search: 'acme', page: 2 }, defaults)).toEqual({
      search: 'acme',
      page: '2',
    })
  })
  it('joins non-empty arrays with commas and omits empty ones', () => {
    expect(filtersToQuery({ ...defaults, siteIds: ['a', 'b'] }, defaults)).toEqual({
      siteIds: 'a,b',
    })
  })
})

describe('queryToFilters', () => {
  const defaults = { search: '', statusId: null, siteIds: [], page: 1, archived: false }

  it('coerces each value to the type of its default', () => {
    const r = queryToFilters(
      { search: 'acme', siteIds: 'a,b', page: '3', archived: 'true' },
      defaults,
    )
    expect(r).toEqual({ search: 'acme', statusId: null, siteIds: ['a', 'b'], page: 3, archived: true })
  })
  it('ignores unknown keys and falls back on empty values', () => {
    const r = queryToFilters({ unknown: 'x', search: '' }, defaults)
    expect(r).toEqual({ ...defaults })
  })
  it('keeps the default for a non-numeric number query', () => {
    expect(queryToFilters({ page: 'notanumber' }, defaults).page).toBe(1)
  })
})

describe('filtersToQuery + queryToFilters — object (date token) round-trip', () => {
  const dateToken = {
    operator: 'before',
    value: '2026-06-22',
    value2: null,
    relative: { dir: 'past', unit: 'day', count: 7 },
  }
  const defaults = { createdAt: null }

  it('filtersToQuery serializes an object value as a JSON string', () => {
    const q = filtersToQuery({ createdAt: dateToken }, defaults)
    expect(typeof q.createdAt).toBe('string')
    expect(JSON.parse(q.createdAt)).toEqual(dateToken)
  })

  it('queryToFilters deserializes a JSON string back to the original object', () => {
    const q = filtersToQuery({ createdAt: dateToken }, defaults)
    const result = queryToFilters(q, defaults)
    expect(result).toEqual({ createdAt: dateToken })
  })

  it('full round-trip preserves object, array, string, and number together', () => {
    const mixedDefaults = { createdAt: null, siteIds: [], search: '', page: 1 }
    const mixedFilters = {
      createdAt: dateToken,
      siteIds: ['a', 'b'],
      search: 'acme',
      page: 3,
    }
    const q = filtersToQuery(mixedFilters, mixedDefaults)
    const result = queryToFilters(q, mixedDefaults)
    expect(result).toEqual(mixedFilters)
  })

  it('a plain string status id (default null) still round-trips as the string, not parsed', () => {
    const statusDefaults = { statusId: null }
    const q = filtersToQuery({ statusId: 'OPEN' }, statusDefaults)
    expect(q.statusId).toBe('OPEN')
    const result = queryToFilters(q, statusDefaults)
    expect(result.statusId).toBe('OPEN')
  })
})

describe('encodeSort / decodeSort', () => {
  it('encodes ascending and descending', () => {
    expect(encodeSort('name', false)).toBe('name')
    expect(encodeSort('name', true)).toBe('-name')
    expect(encodeSort(null, true)).toBeUndefined()
  })
  it('round-trips through decode', () => {
    expect(decodeSort('name')).toEqual({ sortBy: 'name', descending: false })
    expect(decodeSort('-createdAt')).toEqual({ sortBy: 'createdAt', descending: true })
    expect(decodeSort(undefined)).toEqual({ sortBy: null, descending: false })
  })
})
