/**
 * Reordering table / checklist rows and columns.
 *
 * These arrays differ from workflow steps and document sections: POSITION is
 * the order, so a move is a plain splice with nothing to renumber. What still
 * needs pinning is that a bad index can't corrupt or drop an element — a drop
 * outside the list, or onto itself, has to be a no-op rather than a silent
 * data loss in something an author has been typing into.
 */
import { describe, it, expect } from 'vitest'

// Mirrors the splice in useListReorder's onUpdate.
function move(list, oldIndex, newIndex) {
  if (
    !Array.isArray(list) ||
    oldIndex == null ||
    newIndex == null ||
    oldIndex === newIndex ||
    oldIndex < 0 ||
    newIndex < 0 ||
    oldIndex >= list.length ||
    newIndex >= list.length
  ) {
    return list
  }
  const [moved] = list.splice(oldIndex, 1)
  list.splice(newIndex, 0, moved)
  return list
}

describe('row / column reorder', () => {
  it('moves an item down', () => {
    expect(move(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
  })

  it('moves an item up', () => {
    expect(move(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('never changes length', () => {
    // The failure that would matter: a row an author typed silently vanishing.
    for (const [from, to] of [
      [0, 1],
      [1, 0],
      [0, 3],
      [3, 0],
      [2, 2],
    ]) {
      expect(move(['a', 'b', 'c', 'd'], from, to)).toHaveLength(4)
    }
  })

  it('is a no-op onto itself', () => {
    expect(move(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
  })

  it('is a no-op for an out-of-range drop', () => {
    expect(move(['a', 'b'], 5, 0)).toEqual(['a', 'b'])
    expect(move(['a', 'b'], 0, 9)).toEqual(['a', 'b'])
    expect(move(['a', 'b'], -1, 1)).toEqual(['a', 'b'])
  })

  it('tolerates a missing list', () => {
    expect(move(undefined, 0, 1)).toBeUndefined()
  })

  it('works on column objects, not just string rows', () => {
    const cols = [{ label: 'Yes' }, { label: 'No' }, { label: 'N/A' }]
    expect(move(cols, 2, 0).map((c) => c.label)).toEqual(['N/A', 'Yes', 'No'])
  })
})
