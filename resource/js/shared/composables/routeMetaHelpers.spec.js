import { describe, it, expect } from 'vitest'
import {
  matchPattern,
  fillPattern,
  resolveRouteMeta,
  buildBreadcrumbs,
} from './routeMetaHelpers.js'

describe('matchPattern', () => {
  it('matches literal paths', () => {
    expect(matchPattern('/equipment', '/equipment')).toEqual({})
  })
  it('captures params and decodes them', () => {
    expect(matchPattern('/capas/:id', '/capas/abc%20123')).toEqual({ id: 'abc 123' })
  })
  it('returns null on segment-count or literal mismatch', () => {
    expect(matchPattern('/capas/:id', '/capas')).toBeNull()
    expect(matchPattern('/capas/:id', '/audits/x')).toBeNull()
  })
})

describe('fillPattern', () => {
  it('substitutes params back in', () => {
    expect(fillPattern('/capas/:id', { id: '42' })).toBe('/capas/42')
    expect(fillPattern('/capas', {})).toBe('/capas')
  })
})

const registry = {
  '/capas': { title: 'CAPAs' },
  '/capas/:id': { title: (p, ctx) => ctx.recordTitle ?? 'CAPA', parent: '/capas' },
  '/audits': { title: 'Audits' },
}

describe('resolveRouteMeta', () => {
  it('prefers the most literal match', () => {
    expect(resolveRouteMeta(registry, '/capas').pattern).toBe('/capas')
    expect(resolveRouteMeta(registry, '/capas/42').pattern).toBe('/capas/:id')
  })
  it('returns null for unknown paths', () => {
    expect(resolveRouteMeta(registry, '/nope')).toBeNull()
  })
})

describe('buildBreadcrumbs', () => {
  it('builds a root-first trail and drops the last link', () => {
    const crumbs = buildBreadcrumbs(registry, '/capas/42', { recordTitle: 'CAPA-2026-014' })
    expect(crumbs).toEqual([
      { label: 'CAPAs', to: '/capas' },
      { label: 'CAPA-2026-014' },
    ])
  })
  it('single-level page is just itself, unlinked', () => {
    expect(buildBreadcrumbs(registry, '/audits')).toEqual([{ label: 'Audits' }])
  })
  it('returns empty for an unknown path', () => {
    expect(buildBreadcrumbs(registry, '/nope')).toEqual([])
  })
})
