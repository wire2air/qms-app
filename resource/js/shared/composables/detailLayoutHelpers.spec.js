import { describe, it, expect } from 'vitest'
import { resolveDetailState, bucketActions } from './detailLayoutHelpers.js'

describe('resolveDetailState', () => {
  it('prefers loading over everything', () => {
    expect(resolveDetailState({ loading: true, error: true, notFound: true })).toBe('loading')
  })
  it('error before notFound', () => {
    expect(resolveDetailState({ error: true, notFound: true })).toBe('error')
  })
  it('notFound before ready', () => {
    expect(resolveDetailState({ notFound: true })).toBe('notFound')
  })
  it('defaults to ready', () => {
    expect(resolveDetailState({})).toBe('ready')
  })
})

describe('bucketActions', () => {
  const a = (id, priority, variant = 'secondary', visible = true) => ({ id, priority, variant, visible })

  it('returns empty buckets for no actions', () => {
    expect(bucketActions([], 3)).toEqual({ visible: [], overflow: [] })
  })
  it('shows all when at or under the cap', () => {
    const r = bucketActions([a('x', 1), a('y', 2)], 3)
    expect(r.visible.map((d) => d.id)).toEqual(['y', 'x']) // priority desc
    expect(r.overflow).toEqual([])
  })
  it('reserves one slot for overflow when over the cap', () => {
    const r = bucketActions([a('a', 5), a('b', 4), a('c', 3), a('d', 2), a('e', 1)], 3)
    expect(r.visible.map((d) => d.id)).toEqual(['a', 'b']) // maxVisible - 1
    expect(r.overflow.map((d) => d.id)).toEqual(['c', 'd', 'e'])
  })
  it('drops actions with visible === false', () => {
    const r = bucketActions([a('a', 5), a('b', 4, 'secondary', false)], 3)
    expect(r.visible.map((d) => d.id)).toEqual(['a'])
  })
})
