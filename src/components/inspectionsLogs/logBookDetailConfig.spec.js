import { describe, it, expect, vi } from 'vitest'
import { buildLogBookSections, buildLogBookActions } from './logBookDetailConfig.js'

describe('buildLogBookSections', () => {
  it('returns a single details section', () => {
    const s = buildLogBookSections(null)
    expect(s).toHaveLength(1)
    expect(s[0].id).toBe('details')
  })
})

describe('buildLogBookActions', () => {
  function visibleIds(gates) {
    return buildLogBookActions(gates, {})
      .filter((a) => a.visible)
      .map((a) => a.id)
  }

  it('always describes every action, lifecycle and otherwise', () => {
    expect(buildLogBookActions({}, {}).map((a) => a.id)).toEqual([
      'submit',
      'replace',
      'discard',
      'printQr',
      'obsolete',
    ])
  })

  it('DRAFT / REJECTED books offer submit + discard only', () => {
    for (const statusId of ['DRAFT', 'REJECTED']) {
      expect(visibleIds({ canUpdate: true, hasLogBook: true, statusId })).toEqual([
        'submit',
        'discard',
      ])
    }
  })

  it('ACTIVE books offer replace + obsolete, plus the QR label', () => {
    expect(visibleIds({ canUpdate: true, hasLogBook: true, statusId: 'ACTIVE' })).toEqual([
      'replace',
      'printQr',
      'obsolete',
    ])
  })

  it('offers the QR label without update rights — printing is a read', () => {
    // A supervisor who can see a book but not edit it still needs to put a
    // sticker on the machine. Unlike every other action here, this changes
    // nothing.
    expect(visibleIds({ canUpdate: false, hasLogBook: true, statusId: 'ACTIVE' })).toEqual([
      'printQr',
    ])
  })

  it('never offers a label for a book that cannot take entries', () => {
    // A sticker on a machine pointing at a DRAFT or OBSOLETE book sends a
    // technician to a dead end, and nobody discovers it until they are stood
    // in front of it.
    for (const statusId of ['DRAFT', 'REJECTED', 'UNDER_REVIEW', 'INACTIVE', 'OBSOLETE']) {
      expect(visibleIds({ canUpdate: true, hasLogBook: true, statusId })).not.toContain('printQr')
    }
  })

  it('UNDER_REVIEW / INACTIVE / OBSOLETE books offer no header actions', () => {
    for (const statusId of ['UNDER_REVIEW', 'INACTIVE', 'OBSOLETE']) {
      expect(visibleIds({ canUpdate: true, hasLogBook: true, statusId })).toEqual([])
    }
  })

  it('nothing is visible without canUpdate or a loaded book', () => {
    expect(visibleIds({ canUpdate: false, hasLogBook: true, statusId: 'DRAFT' })).toEqual([])
    expect(visibleIds({ canUpdate: true, hasLogBook: false, statusId: 'ACTIVE' })).toEqual([])
  })

  it('wires each handler to its action onSelect', () => {
    const handlers = {
      submitForApproval: vi.fn(),
      createReplacement: vi.fn(),
      discardDraft: vi.fn(),
      markObsolete: vi.fn(),
    }
    const byId = Object.fromEntries(buildLogBookActions({}, handlers).map((a) => [a.id, a]))
    byId.submit.onSelect()
    byId.replace.onSelect()
    byId.discard.onSelect()
    byId.obsolete.onSelect()
    expect(handlers.submitForApproval).toHaveBeenCalled()
    expect(handlers.createReplacement).toHaveBeenCalled()
    expect(handlers.discardDraft).toHaveBeenCalled()
    expect(handlers.markObsolete).toHaveBeenCalled()
  })
})
