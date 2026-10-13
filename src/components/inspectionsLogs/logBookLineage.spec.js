/**
 * A QR sticker outlives the log book row it was printed for. These cover the
 * one guarantee that makes printed labels viable: scan today, scan in three
 * revisions' time, land on the book that is actually accepting entries.
 */
import { describe, it, expect } from 'vitest'
import {
  lineageRootCode,
  labelCodeFor,
  resolveActiveInLineage,
  lineageFailureReason,
} from './logBookLineage.js'

const b = (code, generation, statusId, id = code) => ({ id, code, generation, statusId })

describe('lineageRootCode', () => {
  it('strips only the suffix this generation minted', () => {
    expect(lineageRootCode('CAL-LOG-QA-V3', 3)).toBe('CAL-LOG-QA')
    expect(lineageRootCode('CAL-LOG-QA-V2', 2)).toBe('CAL-LOG-QA')
  })

  it('leaves a generation-1 code alone even when it looks versioned', () => {
    // A book the author genuinely named "PUMP-V2" roots at PUMP-V2; its
    // replacement is PUMP-V2-V2. Mis-stripping here would merge two unrelated
    // lineages and point one book's labels at another book.
    expect(lineageRootCode('PUMP-V2', 1)).toBe('PUMP-V2')
    expect(lineageRootCode('CAL-LOG-QA', 1)).toBe('CAL-LOG-QA')
  })

  it('does not strip a suffix that belongs to a different generation', () => {
    expect(lineageRootCode('ROOT-V2', 3)).toBe('ROOT-V2')
  })

  it('survives missing input rather than throwing on a scan', () => {
    expect(lineageRootCode(null, null)).toBe('')
    expect(lineageRootCode(undefined, 2)).toBe('')
  })
})

describe('labelCodeFor', () => {
  it('prints the root, so every generation of a book shares one label value', () => {
    expect(labelCodeFor(b('CAL-LOG-QA', 1, 'OBSOLETE'))).toBe('CAL-LOG-QA')
    expect(labelCodeFor(b('CAL-LOG-QA-V4', 4, 'ACTIVE'))).toBe('CAL-LOG-QA')
  })
})

describe('resolveActiveInLineage', () => {
  const lineage = [
    b('CAL-LOG-QA', 1, 'OBSOLETE'),
    b('CAL-LOG-QA-V2', 2, 'OBSOLETE'),
    b('CAL-LOG-QA-V3', 3, 'ACTIVE'),
    b('OTHER-LOG', 1, 'ACTIVE'),
  ]

  it('lands a label printed for generation 1 on the live generation 3', () => {
    // The whole point: this label was printed before V2 and V3 existed.
    expect(resolveActiveInLineage(lineage, 'CAL-LOG-QA').id).toBe('CAL-LOG-QA-V3')
  })

  it('matches case-insensitively — printed codes get retyped', () => {
    expect(resolveActiveInLineage(lineage, 'cal-log-qa').id).toBe('CAL-LOG-QA-V3')
  })

  it('never returns a book that cannot accept entries', () => {
    const noneLive = [b('X', 1, 'OBSOLETE'), b('X-V2', 2, 'DRAFT')]
    expect(resolveActiveInLineage(noneLive, 'X')).toBeNull()
  })

  it('picks the newest when a lineage somehow has two active books', () => {
    const twoLive = [b('X', 1, 'ACTIVE'), b('X-V2', 2, 'ACTIVE')]
    expect(resolveActiveInLineage(twoLive, 'X').id).toBe('X-V2')
  })

  it('does not bleed across lineages', () => {
    expect(resolveActiveInLineage(lineage, 'OTHER-LOG').id).toBe('OTHER-LOG')
    expect(resolveActiveInLineage(lineage, 'NOPE')).toBeNull()
  })

  it('returns null rather than throwing on an empty or absent code', () => {
    expect(resolveActiveInLineage(lineage, '')).toBeNull()
    expect(resolveActiveInLineage([], 'CAL-LOG-QA')).toBeNull()
  })
})

describe('lineageFailureReason', () => {
  it('separates "never heard of this code" from "nothing live right now"', () => {
    // The two need different messages: one is a wrong/old label, the other is
    // a book mid-revision that will come back.
    const books = [b('X', 1, 'OBSOLETE'), b('X-V2', 2, 'UNDER_REVIEW')]
    expect(lineageFailureReason(books, 'X')).toBe('NONE_ACTIVE')
    expect(lineageFailureReason(books, 'GHOST')).toBe('UNKNOWN_CODE')
  })

  it('reports no failure when a book resolves', () => {
    expect(lineageFailureReason([b('X', 1, 'ACTIVE')], 'X')).toBeNull()
  })
})
