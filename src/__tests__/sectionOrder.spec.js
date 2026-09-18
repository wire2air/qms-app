/**
 * Document-template section ordering.
 *
 * `order` is stored on each section, so it is the thing that can drift. Every
 * path that changes the list must renumber identically — one that reorders the
 * array but leaves `order` alone gives you badges reading 1,2,3 over sections
 * that save as 3,1,2.
 *
 * The paths are the arrows (moveSection), delete, and insert-at-a-gap
 * (insertSectionAt, 2026-08-16, which replaced drag-and-drop).
 */
import { describe, it, expect } from 'vitest'
import {
  renumber,
  moveSection,
  insertSectionAt,
} from '../components/documentTemplates/sectionOrder.js'

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

describe('insertSectionAt', () => {
  const NEW = { id: 'new', title: 'New', order: 0 }

  it('inserts in the middle and renumbers everything after it', () => {
    const out = insertSectionAt(secs('A', 'B', 'C'), 1, NEW)
    expect(titlesOf(out)).toEqual(['A', 'New', 'B', 'C'])
    expect(orderOf(out)).toEqual([1, 2, 3, 4])
  })

  it('index 0 prepends', () => {
    const out = insertSectionAt(secs('A', 'B'), 0, NEW)
    expect(titlesOf(out)).toEqual(['New', 'A', 'B'])
    expect(orderOf(out)).toEqual([1, 2, 3])
  })

  it('index === length appends — the bottom Add Section button', () => {
    const out = insertSectionAt(secs('A', 'B'), 2, NEW)
    expect(titlesOf(out)).toEqual(['A', 'B', 'New'])
    expect(orderOf(out)).toEqual([1, 2, 3])
  })

  it('overwrites the incoming order rather than trusting it', () => {
    // blankSection() ships order: 0; the badge must never show it.
    const out = insertSectionAt(secs('A', 'B'), 1, { id: 'n', order: 99 })
    expect(orderOf(out)).toEqual([1, 2, 3])
  })

  it('clamps out-of-range indices instead of dropping the section', () => {
    expect(titlesOf(insertSectionAt(secs('A', 'B'), 9, NEW))).toEqual(['A', 'B', 'New'])
    expect(titlesOf(insertSectionAt(secs('A', 'B'), -3, NEW))).toEqual(['New', 'A', 'B'])
    expect(titlesOf(insertSectionAt(secs('A', 'B'), undefined, NEW))).toEqual(['A', 'B', 'New'])
  })

  it('handles the empty list — the first section of a blank template', () => {
    const out = insertSectionAt([], 0, NEW)
    expect(titlesOf(out)).toEqual(['New'])
    expect(orderOf(out)).toEqual([1])
  })

  it('does not mutate the input array', () => {
    const input = secs('A', 'B')
    insertSectionAt(input, 1, NEW)
    expect(input).toHaveLength(2)
  })

  it('leaves order contiguous and unique after repeated inserts', () => {
    let list = secs('A', 'B', 'C')
    list = insertSectionAt(list, 0, { id: 'x' })
    list = insertSectionAt(list, 2, { id: 'y' })
    list = insertSectionAt(list, 5, { id: 'z' })
    expect(orderOf(list)).toEqual([1, 2, 3, 4, 5, 6])
    expect(new Set(orderOf(list)).size).toBe(6)
  })
})
