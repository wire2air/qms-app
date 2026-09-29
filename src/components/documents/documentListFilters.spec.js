// The Archived quick view showed nothing. Reported against a document that was
// archived while still in DRAFT, with no effective version — it appeared under
// no pill at all except All.
//
// Two independent causes, both covered here:
//
//   1. Archive was a SOFT DELETE (DocumentObsoletionDialog called
//      document.delete() after stamping the obsoletion fields). The syncEngine
//      excludes soft-deleted rows from where(), so archived documents never
//      reached this function in the first place. Fixed by making obsoletion a
//      status transition; there is nothing left to test here, because the rows
//      simply arrive now.
//
//   2. This function tested the latest VERSION's status for the archived pill,
//      while obsoletion stamps the DOCUMENT row. That is what these tests
//      pin — a document may be archived at ANY version status, so an
//      archived-while-DRAFT document has to land under Archived and nowhere
//      else.
import { describe, it, expect } from 'vitest'
import { applyActiveFilter } from './documentListFilters.js'

const ME = 'user-me'

// An archived draft: the exact shape that went missing.
const archivedDraft = { id: 'd1', statusId: 'ARCHIVED', authorId: 'someone', userId: 'someone' }
// An archived document that HAD been issued — the ordinary obsoletion case.
const archivedEffective = { id: 'd2', statusId: 'ARCHIVED', authorId: 'someone', userId: 'someone' }
const liveDraft = { id: 'd3', statusId: 'ACTIVE', authorId: ME, userId: ME }
const liveEffective = { id: 'd4', statusId: 'ACTIVE', authorId: 'someone', userId: 'someone' }
const inReview = { id: 'd5', statusId: 'ACTIVE', authorId: 'someone', userId: 'someone' }
const supersededOnly = { id: 'd6', statusId: 'ACTIVE', authorId: 'someone', userId: 'someone' }

const ROWS = [archivedDraft, archivedEffective, liveDraft, liveEffective, inReview, supersededOnly]

// documentId -> 'EFFECTIVE' when the document has an effective version.
const CURRENT = { d2: 'EFFECTIVE', d4: 'EFFECTIVE' }
// documentId -> latest version status.
const LATEST = {
  d1: 'DRAFT', // archived while still a draft — the reported case
  d2: 'EFFECTIVE', // archived after being issued; its version keeps its status
  d3: 'DRAFT',
  d4: 'EFFECTIVE',
  d5: 'IN_REVIEW',
  d6: 'SUPERSEDED',
}

const ids = (af) => applyActiveFilter(ROWS, af, CURRENT, LATEST, ME).map((d) => d.id)

describe('document register — archived quick view', () => {
  it('shows an archived document whose latest version is still DRAFT', () => {
    // The regression. Under the old version-status test this was unreachable:
    // latestStatuses.d1 === 'DRAFT', which is in no branch of the archived pill.
    expect(ids('archived')).toContain('d1')
  })

  it('shows an archived document regardless of what its versions say', () => {
    // Versions are deliberately left alone by obsoletion, so d2's version is
    // still EFFECTIVE. The document row is the authority.
    expect(ids('archived')).toContain('d2')
  })

  it('still shows a document with a superseded latest version', () => {
    // SUPERSEDED really is per-version state, on a document that is still
    // active — that arm must survive the fix.
    expect(ids('archived')).toContain('d6')
  })

  it('shows nothing that is neither archived nor superseded', () => {
    expect(ids('archived')).not.toContain('d3')
    expect(ids('archived')).not.toContain('d4')
    expect(ids('archived')).not.toContain('d5')
  })
})

describe('document register — archived rows stay OUT of the live views', () => {
  // The other half of the same bug. Soft-delete used to hide archived documents
  // from every pill; now that they are real rows, each live view has to exclude
  // them explicitly or an obsolete document reads as current.
  it('Draft excludes an archived draft', () => {
    expect(ids('draft')).toEqual(['d3'])
  })

  it('Effective excludes an archived document that has an effective version', () => {
    expect(ids('effective')).toEqual(['d4'])
  })

  it('In review excludes archived documents', () => {
    expect(ids('in_review')).toEqual(['d5'])
  })

  it('All still shows everything — the register is read whole', () => {
    expect(ids('all')).toHaveLength(ROWS.length)
  })
})

describe('document register — mine', () => {
  it('matches on author or owner', () => {
    expect(ids('mine')).toEqual(['d3'])
  })

  it('matches nothing when there is no viewer', () => {
    expect(applyActiveFilter(ROWS, 'mine', CURRENT, LATEST, null)).toEqual([])
  })
})
