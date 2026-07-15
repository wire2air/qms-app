import { describe, it, expect, vi } from 'vitest'
import {
  buildDocumentBanners,
  buildDocumentTabs,
  buildDocumentActions,
} from './documentDetailConfig.js'

describe('buildDocumentBanners', () => {
  it('returns [] when document is null', () => {
    expect(buildDocumentBanners(null)).toEqual([])
  })

  it('adds an archived read-only banner when ARCHIVED', () => {
    const b = buildDocumentBanners({ statusId: 'ARCHIVED' })
    const a = b.find((x) => x.id === 'archived')
    expect(a).toBeDefined()
    expect(a.tone).toBe('neutral')
    expect(a.message.toLowerCase()).toContain('archived')
  })

  it('no banner for a normal document', () => {
    expect(buildDocumentBanners({ statusId: 'EFFECTIVE' })).toEqual([])
  })
})

describe('buildDocumentTabs', () => {
  it('hides Change Control on a first version (not a revision)', () => {
    const t = buildDocumentTabs(false)
    expect(t.map((x) => x.value)).toEqual(['content', 'training'])
  })

  it('shows Change Control between Content and Training on a revision', () => {
    const t = buildDocumentTabs(true)
    expect(t.map((x) => x.value)).toEqual(['content', 'changeControl', 'training'])
  })

  it('all tabs are panel-mode', () => {
    buildDocumentTabs(true).forEach((t) => expect(t.mode).toBe('panel'))
  })
})

describe('buildDocumentActions', () => {
  const visibleIds = (gates) =>
    buildDocumentActions(gates, {})
      .filter((a) => a.visible)
      .map((a) => a.id)

  it('always exposes the standard secondary actions', () => {
    const ids = visibleIds({})
    expect(ids).toEqual(
      expect.arrayContaining(['print', 'reports', 'revisionHistory', 'auditLog', 'export']),
    )
  })

  it('shows Create New Draft only when canCreate', () => {
    expect(visibleIds({ canCreate: true })).toContain('createDraft')
    expect(visibleIds({})).not.toContain('createDraft')
  })

  it('shows Submit For Review only when canSubmitForReview', () => {
    expect(visibleIds({ canSubmitForReview: true })).toContain('submitForReview')
    expect(visibleIds({})).not.toContain('submitForReview')
  })

  it('shows Set Effective only when canSetEffective', () => {
    expect(visibleIds({ canSetEffective: true })).toContain('setEffective')
    expect(visibleIds({})).not.toContain('setEffective')
  })

  it('Cancel Review is a danger action gated on canCancelReview', () => {
    const cancel = buildDocumentActions({ canCancelReview: true }, {}).find(
      (a) => a.id === 'cancelReview',
    )
    expect(cancel.visible).toBe(true)
    expect(cancel.variant).toBe('danger')
    expect(buildDocumentActions({}, {}).find((a) => a.id === 'cancelReview').visible).toBe(false)
  })

  it('Show Workflow needs inReview AND canEdit', () => {
    expect(visibleIds({ inReview: true, canEdit: true })).toContain('showWorkflow')
    expect(visibleIds({ inReview: true })).not.toContain('showWorkflow')
    expect(visibleIds({ canEdit: true })).not.toContain('showWorkflow')
  })

  it('Delete Version needs canDelete AND a DRAFT selected version', () => {
    expect(visibleIds({ canDelete: true, selectedStatus: 'DRAFT' })).toContain('deleteVersion')
    expect(visibleIds({ canDelete: true, selectedStatus: 'EFFECTIVE' })).not.toContain('deleteVersion')
    expect(visibleIds({ selectedStatus: 'DRAFT' })).not.toContain('deleteVersion')
  })

  it('Archive needs canEdit and a non-archived document', () => {
    expect(visibleIds({ canEdit: true, statusId: 'EFFECTIVE' })).toContain('archive')
    expect(visibleIds({ canEdit: true, statusId: 'ARCHIVED' })).not.toContain('archive')
  })

  it('the status-driven actions all carry the top priority (one primary at a time)', () => {
    const a = buildDocumentActions({}, {})
    const prio = (id) => a.find((x) => x.id === id).priority
    expect(prio('createDraft')).toBe(100)
    expect(prio('submitForReview')).toBe(100)
    expect(prio('setEffective')).toBe(100)
    expect(prio('print')).toBeLessThan(prio('submitForReview'))
  })

  it('wires handlers to onSelect', () => {
    const handlers = {
      createDraft: vi.fn(),
      submitForReview: vi.fn(),
      setEffective: vi.fn(),
      cancelReview: vi.fn(),
      showWorkflow: vi.fn(),
      print: vi.fn(),
      reports: vi.fn(),
      revisionHistory: vi.fn(),
      auditLog: vi.fn(),
      export: vi.fn(),
      deleteVersion: vi.fn(),
      archive: vi.fn(),
    }
    const a = buildDocumentActions({}, handlers)
    a.forEach((d) => d.onSelect && d.onSelect())
    Object.values(handlers).forEach((fn) => expect(fn).toHaveBeenCalled())
  })
})
