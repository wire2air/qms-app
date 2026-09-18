import { describe, it, expect } from 'vitest'
import { resolveNavModel } from './detailNavHelpers.js'

describe('resolveNavModel', () => {
  it('returns empty for no input', () => {
    expect(resolveNavModel()).toEqual({ items: [], hasAnchor: false, hasPanel: false })
  })
  it('maps sections to anchor items keyed by id', () => {
    const r = resolveNavModel([{ id: 'details', label: 'Details' }], [])
    expect(r.items).toEqual([{ key: 'details', label: 'Details', icon: undefined, mode: 'anchor', count: undefined }])
    expect(r.hasAnchor).toBe(true)
    expect(r.hasPanel).toBe(false)
  })
  it('maps tabs to panel items keyed by value and resolves count functions', () => {
    const r = resolveNavModel([], [{ value: 'docs', label: 'Documents', count: () => 12 }])
    expect(r.items[0]).toEqual({ key: 'docs', label: 'Documents', icon: undefined, mode: 'panel', count: 12 })
    expect(r.hasPanel).toBe(true)
  })
  it('honors an anchor-mode tab', () => {
    const r = resolveNavModel([], [{ value: 'x', label: 'X', mode: 'anchor' }])
    expect(r.items[0].mode).toBe('anchor')
    expect(r.hasAnchor).toBe(true)
  })
  it('drops items with visible === false', () => {
    const r = resolveNavModel([{ id: 'a', label: 'A', visible: false }], [{ value: 'b', label: 'B', visible: false }])
    expect(r.items).toEqual([])
  })
  it('combines sections (anchor) above tabs (panel)', () => {
    const r = resolveNavModel([{ id: 's', label: 'S' }], [{ value: 't', label: 'T' }])
    expect(r.items.map((i) => i.key)).toEqual(['s', 't'])
    expect(r.hasAnchor && r.hasPanel).toBe(true)
  })
})
