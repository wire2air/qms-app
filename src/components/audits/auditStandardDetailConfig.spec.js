import { describe, it, expect } from 'vitest'
import {
  buildAuditStandardBanners,
  buildAuditStandardSections,
  buildAuditStandardActions,
} from './auditStandardDetailConfig.js'

describe('buildAuditStandardBanners', () => {
  it('returns [] when standard is null', () => {
    expect(buildAuditStandardBanners(null, {})).toEqual([])
  })

  it('adds a read-only neutral banner when ARCHIVED and not editable', () => {
    const b = buildAuditStandardBanners({ statusId: 'ARCHIVED' }, { isEditable: false })
    const ro = b.find((x) => x.id === 'read-only')
    expect(ro).toBeDefined()
    expect(ro.tone).toBe('neutral')
    expect(ro.message.toLowerCase()).toContain('archived')
  })

  it('no read-only banner when ARCHIVED but editable', () => {
    const b = buildAuditStandardBanners({ statusId: 'ARCHIVED' }, { isEditable: true })
    expect(b.some((x) => x.id === 'read-only')).toBe(false)
  })

  it('no read-only banner when ACTIVE', () => {
    const b = buildAuditStandardBanners({ statusId: 'ACTIVE' }, { isEditable: false })
    expect(b.some((x) => x.id === 'read-only')).toBe(false)
  })

  it('no read-only banner when INACTIVE and editable', () => {
    const b = buildAuditStandardBanners({ statusId: 'INACTIVE' }, { isEditable: true })
    expect(b.some((x) => x.id === 'read-only')).toBe(false)
  })
})

describe('buildAuditStandardSections', () => {
  it('always includes details and requirements', () => {
    const s = buildAuditStandardSections({ statusId: 'ACTIVE' }, {})
    const ids = s.map((x) => x.id)
    expect(ids).toContain('details')
    expect(ids).toContain('requirements')
  })

  it('workflow section is visible when underReviewVersion is set', () => {
    const s = buildAuditStandardSections(
      { statusId: 'ACTIVE' },
      { underReviewVersion: { id: 'v1', statusId: 'UNDER_REVIEW' } },
    )
    const workflow = s.find((x) => x.id === 'workflow')
    expect(workflow).toBeDefined()
    expect(workflow.visible).toBe(true)
  })

  it('workflow section is NOT visible when underReviewVersion is null', () => {
    const s = buildAuditStandardSections({ statusId: 'ACTIVE' }, { underReviewVersion: null })
    const workflow = s.find((x) => x.id === 'workflow')
    expect(workflow?.visible).toBeFalsy()
  })

  it('all sections have a label', () => {
    const s = buildAuditStandardSections({ statusId: 'ACTIVE' }, {})
    s.forEach((section) => expect(section.label).toBeTruthy())
  })
})

describe('buildAuditStandardActions', () => {
  const handlers = {
    openClone() {},
    openSubmit() {},
    spawnNewDraft() {},
    openAudit() {},
    openDelete() {},
    openArchive() {},
    restoreStandard() {},
  }

  const visibleIds = (gates) =>
    buildAuditStandardActions(gates, handlers)
      .filter((a) => a.visible)
      .map((a) => a.id)

  it('effective standard: archivable, never deletable (user rule 2026-08-24)', () => {
    const ids = visibleIds({ canDelete: true, hasStandard: true, hasEffectiveVersion: true })
    expect(ids).toContain('archive')
    expect(ids).not.toContain('delete')
    expect(ids).not.toContain('restore')
  })

  it('never-effective draft: discardable, not archivable', () => {
    const ids = visibleIds({ canDelete: true, hasStandard: true, hasEffectiveVersion: false })
    expect(ids).toContain('delete')
    expect(ids).not.toContain('archive')
  })

  it('archived standard: restore only', () => {
    const ids = visibleIds({
      canDelete: true,
      hasStandard: true,
      hasEffectiveVersion: true,
      isArchived: true,
    })
    expect(ids).toContain('restore')
    expect(ids).not.toContain('archive')
    expect(ids).not.toContain('delete')
  })

  it('shows duplicate when canCreate and hasStandard', () => {
    const a = buildAuditStandardActions(
      { canCreate: true, canDelete: false, canSubmitEditable: false, canSpawnNewDraft: false, hasStandard: true, hasEditableVersion: false, spawningDraft: false, deleting: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'duplicate').visible).toBe(true)
  })

  it('hides duplicate when canCreate is false', () => {
    const a = buildAuditStandardActions(
      { canCreate: false, canDelete: false, canSubmitEditable: false, canSpawnNewDraft: false, hasStandard: true, hasEditableVersion: false, spawningDraft: false, deleting: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'duplicate').visible).toBe(false)
  })

  it('shows submit (primary) when canSubmitEditable and hasEditableVersion', () => {
    const a = buildAuditStandardActions(
      { canCreate: false, canDelete: false, canSubmitEditable: true, canSpawnNewDraft: false, hasStandard: true, hasEditableVersion: true, spawningDraft: false, deleting: false },
      handlers,
    )
    const submit = a.find((x) => x.id === 'submit')
    expect(submit.visible).toBe(true)
    expect(submit.variant).toBe('primary')
  })

  it('hides submit when no editable version', () => {
    const a = buildAuditStandardActions(
      { canCreate: false, canDelete: false, canSubmitEditable: true, canSpawnNewDraft: false, hasStandard: true, hasEditableVersion: false, spawningDraft: false, deleting: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'submit').visible).toBe(false)
  })

  it('shows newDraft when canSpawnNewDraft', () => {
    const a = buildAuditStandardActions(
      { canCreate: false, canDelete: false, canSubmitEditable: false, canSpawnNewDraft: true, hasStandard: true, hasEditableVersion: false, spawningDraft: false, deleting: false },
      handlers,
    )
    const nd = a.find((x) => x.id === 'newDraft')
    expect(nd.visible).toBe(true)
    expect(nd.disabled).toBe(false)
  })

  it('newDraft is disabled and loading while spawningDraft', () => {
    const a = buildAuditStandardActions(
      { canCreate: false, canDelete: false, canSubmitEditable: false, canSpawnNewDraft: true, hasStandard: true, hasEditableVersion: false, spawningDraft: true, deleting: false },
      handlers,
    )
    const nd = a.find((x) => x.id === 'newDraft')
    expect(nd.disabled).toBe(true)
    expect(nd.loading).toBe(true)
  })

  it('audit is always visible when hasStandard', () => {
    const a = buildAuditStandardActions(
      { canCreate: false, canDelete: false, canSubmitEditable: false, canSpawnNewDraft: false, hasStandard: true, hasEditableVersion: false, spawningDraft: false, deleting: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'audit').visible).toBe(true)
  })

  it('shows delete when canDelete and hasStandard', () => {
    const a = buildAuditStandardActions(
      { canCreate: false, canDelete: true, canSubmitEditable: false, canSpawnNewDraft: false, hasStandard: true, hasEditableVersion: false, spawningDraft: false, deleting: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'delete').visible).toBe(true)
  })

  it('delete is disabled and loading while deleting', () => {
    const a = buildAuditStandardActions(
      { canCreate: false, canDelete: true, canSubmitEditable: false, canSpawnNewDraft: false, hasStandard: true, hasEditableVersion: false, spawningDraft: false, deleting: true },
      handlers,
    )
    const del = a.find((x) => x.id === 'delete')
    expect(del.disabled).toBe(true)
    expect(del.loading).toBe(true)
  })

  it('wires onSelect to the provided handlers', () => {
    let cloneOpened = false
    const a = buildAuditStandardActions(
      { canCreate: true, canDelete: false, canSubmitEditable: false, canSpawnNewDraft: false, hasStandard: true, hasEditableVersion: false, spawningDraft: false, deleting: false },
      { ...handlers, openClone() { cloneOpened = true } },
    )
    a.find((x) => x.id === 'duplicate').onSelect()
    expect(cloneOpened).toBe(true)
  })
})
