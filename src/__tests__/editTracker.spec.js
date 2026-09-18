import { describe, it, expect, afterEach } from 'vitest'
import {
  beginHydration,
  endHydration,
  markEdited,
  isEdited,
  snapshotEdits,
  clearEditsUpTo,
  clearAllEdits,
} from '@syncEngine/core/editTracker.js'

describe('editTracker', () => {
  afterEach(() => endHydration())

  it('marks and reports user edits per instance + field', () => {
    const a = {}
    const b = {}
    markEdited(a, 'stepType')
    expect(isEdited(a, 'stepType')).toBe(true)
    expect(isEdited(a, 'name')).toBe(false)
    expect(isEdited(b, 'stepType')).toBe(false)
  })

  it('ignores writes made while hydrating (engine-driven, not user edits)', () => {
    const a = {}
    beginHydration()
    markEdited(a, 'stepType')
    endHydration()
    expect(isEdited(a, 'stepType')).toBe(false)
  })

  it('clearEditsUpTo clears exactly the flushed edits', () => {
    const a = {}
    markEdited(a, 'name')
    markEdited(a, 'stepType')
    const snap = snapshotEdits(a)
    clearEditsUpTo(a, snap)
    expect(isEdited(a, 'name')).toBe(false)
    expect(isEdited(a, 'stepType')).toBe(false)
  })

  it('an edit made AFTER the snapshot (mid-flight) survives the clear', () => {
    const a = {}
    // Save #1 flushes stepType=APPROVAL…
    markEdited(a, 'stepType')
    const snap = snapshotEdits(a)
    // …user clicks ACTION while the request is in flight (newer seq)…
    markEdited(a, 'stepType')
    // …server acks save #1 → clear up to the snapshot.
    clearEditsUpTo(a, snap)
    // The mid-flight edit is still protected: hydrate must not clobber it.
    expect(isEdited(a, 'stepType')).toBe(true)
  })

  it('a failed save clears nothing (edits stay protected for the retry)', () => {
    const a = {}
    markEdited(a, 'stepType')
    snapshotEdits(a) // patch built, request failed → clearEditsUpTo never called
    expect(isEdited(a, 'stepType')).toBe(true)
  })

  it('clearAllEdits drops everything (successful CREATE)', () => {
    const a = {}
    markEdited(a, 'name')
    markEdited(a, 'stepType')
    clearAllEdits(a)
    expect(isEdited(a, 'name')).toBe(false)
    expect(isEdited(a, 'stepType')).toBe(false)
  })

  it('snapshot is a copy — later edits do not mutate it', () => {
    const a = {}
    markEdited(a, 'name')
    const snap = snapshotEdits(a)
    markEdited(a, 'stepType')
    expect(snap.has('stepType')).toBe(false)
  })
})
