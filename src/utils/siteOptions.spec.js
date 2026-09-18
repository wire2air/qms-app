import { describe, it, expect } from 'vitest'
import { selectableSites } from './siteOptions'

const ACTIVE = { id: 'a', name: 'Mumbai', isActive: true }
const OTHER = { id: 'b', name: 'Delhi', isActive: true }
const INACTIVE = { id: 'c', name: 'Pune', isActive: false }
const LEGACY = { id: 'd', name: 'Chennai' } // no isActive (stale IDB / pre-migration)

describe('selectableSites', () => {
  it('offers active sites', () => {
    expect(selectableSites([ACTIVE, OTHER], null).map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('hides an inactive site that is not selected', () => {
    expect(selectableSites([ACTIVE, INACTIVE], null).map((s) => s.id)).toEqual(['a'])
  })

  // The important one. If an inactive-but-assigned site were dropped, its chip
  // would vanish (misrepresenting real access) and the next save would
  // round-trip a value the picker never showed — silently un-assigning it.
  it('KEEPS an inactive site that is currently selected (multiple)', () => {
    expect(selectableSites([ACTIVE, INACTIVE], ['a', 'c']).map((s) => s.id)).toEqual(['a', 'c'])
  })

  it('KEEPS an inactive site that is currently selected (single)', () => {
    expect(selectableSites([ACTIVE, INACTIVE], 'c').map((s) => s.id)).toEqual(['a', 'c'])
  })

  it('treats a missing isActive as usable, not hidden', () => {
    expect(selectableSites([LEGACY], null).map((s) => s.id)).toEqual(['d'])
  })

  it('is safe with empty / non-array input', () => {
    expect(selectableSites([], null)).toEqual([])
    expect(selectableSites(undefined, null)).toEqual([])
    expect(selectableSites(null, ['a'])).toEqual([])
  })

  it('ignores a null selection without treating it as an id', () => {
    expect(selectableSites([INACTIVE], [null, undefined, ''])).toEqual([])
  })
})
