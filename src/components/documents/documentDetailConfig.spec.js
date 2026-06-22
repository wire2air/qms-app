import { describe, it, expect } from 'vitest'
import { buildDocumentBanners, buildDocumentSections, buildDocumentActions } from './documentDetailConfig.js'

describe('buildDocumentBanners', () => {
  it('returns [] when document is null', () => {
    expect(buildDocumentBanners(null, {})).toEqual([])
  })

  it('returns [] for a non-archived document', () => {
    const b = buildDocumentBanners({ statusId: 'DRAFT' }, { isArchived: false })
    expect(b).toEqual([])
  })

  it('adds a neutral archived banner when isArchived', () => {
    const b = buildDocumentBanners({ statusId: 'ARCHIVED' }, { isArchived: true })
    const banner = b.find((x) => x.id === 'archived')
    expect(banner).toBeDefined()
    expect(banner.tone).toBe('neutral')
    expect(banner.title).toBeTruthy()
    expect(banner.message.toLowerCase()).toContain('archived')
  })

  it('does NOT add archived banner when isArchived is false', () => {
    const b = buildDocumentBanners({ statusId: 'EFFECTIVE' }, { isArchived: false })
    expect(b.some((x) => x.id === 'archived')).toBe(false)
  })

  it('returns [] with no options when document exists', () => {
    const b = buildDocumentBanners({ statusId: 'DRAFT' })
    expect(b).toEqual([])
  })
})

describe('buildDocumentSections', () => {
  it('always returns a single content section', () => {
    const s = buildDocumentSections({ statusId: 'DRAFT' })
    expect(s.map((x) => x.id)).toEqual(['content'])
  })

  it('content section has a label', () => {
    const s = buildDocumentSections({ statusId: 'EFFECTIVE' })
    expect(s[0].label).toBeTruthy()
  })

  it('works when document is null', () => {
    const s = buildDocumentSections(null)
    expect(s).toHaveLength(1)
    expect(s[0].id).toBe('content')
  })
})

describe('buildDocumentActions', () => {
  const handlers = {
    createDraft() {},
    submitForReview() {},
    cancelReview() {},
    setEffective() {},
    showWorkflow() {},
    print() {},
    revisionHistory() {},
    auditLog() {},
    discussion() {},
    export() {},
    deleteVersion() {},
    archiveDocument() {},
  }

  it('print, revision-history, audit, discussion, export are always visible', () => {
    const a = buildDocumentActions({}, handlers)
    const alwaysOn = ['print', 'revision-history', 'audit', 'discussion', 'export']
    alwaysOn.forEach((id) => {
      expect(a.find((x) => x.id === id).visible).toBe(true)
    })
  })

  it('create-draft is visible only when canCreate', () => {
    const withCreate = buildDocumentActions({ canCreate: true }, handlers)
    const withoutCreate = buildDocumentActions({ canCreate: false }, handlers)
    expect(withCreate.find((x) => x.id === 'create-draft').visible).toBe(true)
    expect(withoutCreate.find((x) => x.id === 'create-draft').visible).toBe(false)
  })

  it('submit-review is visible only when canSubmitForReview', () => {
    const a = buildDocumentActions({ canSubmitForReview: true }, handlers)
    expect(a.find((x) => x.id === 'submit-review').visible).toBe(true)
    const b = buildDocumentActions({ canSubmitForReview: false }, handlers)
    expect(b.find((x) => x.id === 'submit-review').visible).toBe(false)
  })

  it('cancel-review is visible only when canCancelReview', () => {
    const a = buildDocumentActions({ canCancelReview: true }, handlers)
    expect(a.find((x) => x.id === 'cancel-review').visible).toBe(true)
  })

  it('cancel-review has danger variant', () => {
    const a = buildDocumentActions({ canCancelReview: true }, handlers)
    expect(a.find((x) => x.id === 'cancel-review').variant).toBe('danger')
  })

  it('set-effective is visible only when canSetEffective', () => {
    const a = buildDocumentActions({ canSetEffective: true }, handlers)
    expect(a.find((x) => x.id === 'set-effective').visible).toBe(true)
    const b = buildDocumentActions({ canSetEffective: false }, handlers)
    expect(b.find((x) => x.id === 'set-effective').visible).toBe(false)
  })

  it('show-workflow is visible only when canShowWorkflow', () => {
    const a = buildDocumentActions({ canShowWorkflow: true }, handlers)
    expect(a.find((x) => x.id === 'show-workflow').visible).toBe(true)
    const b = buildDocumentActions({ canShowWorkflow: false }, handlers)
    expect(b.find((x) => x.id === 'show-workflow').visible).toBe(false)
  })

  it('delete-version is visible only when canDeleteVersion', () => {
    const a = buildDocumentActions({ canDeleteVersion: true }, handlers)
    expect(a.find((x) => x.id === 'delete-version').visible).toBe(true)
    const b = buildDocumentActions({ canDeleteVersion: false }, handlers)
    expect(b.find((x) => x.id === 'delete-version').visible).toBe(false)
  })

  it('archive is visible only when both canEdit and canDelete', () => {
    const both = buildDocumentActions({ canEdit: true, canDelete: true }, handlers)
    expect(both.find((x) => x.id === 'archive').visible).toBe(true)

    const editOnly = buildDocumentActions({ canEdit: true, canDelete: false }, handlers)
    expect(editOnly.find((x) => x.id === 'archive').visible).toBe(false)

    const deleteOnly = buildDocumentActions({ canEdit: false, canDelete: true }, handlers)
    expect(deleteOnly.find((x) => x.id === 'archive').visible).toBe(false)
  })

  it('archive has danger variant', () => {
    const a = buildDocumentActions({ canEdit: true, canDelete: true }, handlers)
    expect(a.find((x) => x.id === 'archive').variant).toBe('danger')
  })

  it('wires onSelect to provided handlers', () => {
    let printed = false
    const a = buildDocumentActions(
      {},
      { ...handlers, print() { printed = true } },
    )
    a.find((x) => x.id === 'print').onSelect()
    expect(printed).toBe(true)
  })

  it('wires createDraft handler', () => {
    let called = false
    const a = buildDocumentActions(
      { canCreate: true },
      { ...handlers, createDraft() { called = true } },
    )
    a.find((x) => x.id === 'create-draft').onSelect()
    expect(called).toBe(true)
  })

  it('all actions have an id and a label', () => {
    const a = buildDocumentActions(
      { canCreate: true, canSubmitForReview: true, canEdit: true, canDelete: true },
      handlers,
    )
    a.forEach((action) => {
      expect(action.id).toBeTruthy()
      expect(action.label).toBeTruthy()
    })
  })

  it('returns no visible primary actions with empty gates', () => {
    const a = buildDocumentActions({}, handlers)
    const visiblePrimary = a.filter((x) => x.visible && x.variant === 'primary')
    expect(visiblePrimary).toHaveLength(0)
  })
})
