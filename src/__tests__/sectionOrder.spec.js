/**
 * Document-template section ordering.
 *
 * `order` is stored on each section, so it is the thing that can drift. The
 * arrows always renumbered; drag-and-drop (added 2026-08-15) is a second path
 * to the same state and must renumber identically — a drag that moves the DOM
 * but leaves `order` alone gives you badges reading 1,2,3 over sections that
 * save as 3,1,2.
 */
import { describe, it, expect } from 'vitest'
import { renumber, moveSection } from '../components/documentTemplates/sectionOrder.js'

const secs = (...titles) => titles.map((t, i) => ({ id: t, title: t, order: i + 1 }))
const orderOf = (arr) => arr.map((s) => s.order)
const titlesOf = (arr) => arr.map((s) => s.title)

describe('renumber', () => {
  it('assigns 1..n in array order', () => {
    const out = renumber([{ id: 'a', order: 9 }, { id: 'b' }, { id: 'c', order: 2 }])
    expect(orderOf(out)).toEqual([1, 2, 3])
  })

  it('does not mutate the input', () => {
    const input = [{ id: 'a', order: 5 }]
    renumber(input)
    expect(input[0].order).toBe(5)
  })

  it('preserves every other field', () => {
    const out = renumber([
      { id: 'a', title: 'Purpose', sectionType: 'text', instructions: '<p>x</p>' },
    ])
    expect(out[0]).toMatchObject({
      title: 'Purpose',
      sectionType: 'text',
      instructions: '<p>x</p>',
    })
  })

  it('handles empty and missing input', () => {
    expect(renumber([])).toEqual([])
    expect(renumber(undefined)).toEqual([])
  })
})

describe('moveSection', () => {
  it('moves down and renumbers', () => {
    const out = moveSection(secs('A', 'B', 'C'), 0, 2)
    expect(titlesOf(out)).toEqual(['B', 'C', 'A'])
    expect(orderOf(out)).toEqual([1, 2, 3])
  })

  it('moves up and renumbers', () => {
    const out = moveSection(secs('A', 'B', 'C'), 2, 0)
    expect(titlesOf(out)).toEqual(['C', 'A', 'B'])
    expect(orderOf(out)).toEqual([1, 2, 3])
  })

  it('leaves order contiguous after any move — never a gap or a duplicate', () => {
    const out = moveSection(secs('A', 'B', 'C', 'D', 'E'), 3, 1)
    expect(orderOf(out)).toEqual([1, 2, 3, 4, 5])
    expect(new Set(orderOf(out)).size).toBe(5)
  })

  it('is a no-op for a move onto itself', () => {
    expect(titlesOf(moveSection(secs('A', 'B'), 1, 1))).toEqual(['A', 'B'])
  })

  it('ignores out-of-range indices rather than dropping a section', () => {
    expect(titlesOf(moveSection(secs('A', 'B'), 5, 0))).toEqual(['A', 'B'])
    expect(titlesOf(moveSection(secs('A', 'B'), 0, 9))).toEqual(['A', 'B'])
    expect(titlesOf(moveSection(secs('A', 'B'), -1, 0))).toEqual(['A', 'B'])
  })

  it('still renumbers when the move itself is rejected', () => {
    // A list that arrived with stale orders must come back clean either way.
    const stale = [
      { id: 'a', order: 7 },
      { id: 'b', order: 7 },
    ]
    expect(orderOf(moveSection(stale, 0, 0))).toEqual([1, 2])
  })
})
