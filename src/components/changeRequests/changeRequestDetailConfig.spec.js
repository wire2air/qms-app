import { describe, it, expect } from 'vitest'
import {
  buildChangeRequestBanners,
  buildChangeRequestSections,
  buildChangeRequestActions,
} from './changeRequestDetailConfig.js'

describe('buildChangeRequestBanners', () => {
  it('returns [] when cr is null', () => {
    expect(buildChangeRequestBanners(null, {})).toEqual([])
  })

  it('adds a read-only neutral banner when CLOSED and not editable', () => {
    const b = buildChangeRequestBanners({ statusId: 'CLOSED' }, { isEditable: false })
    const ro = b.find((x) => x.id === 'read-only')
    expect(ro).toBeDefined()
    expect(ro.tone).toBe('neutral')
    expect(ro.message.toLowerCase()).toContain('closed')
  })

  it('adds a read-only neutral banner when CANCELLED and not editable', () => {
    const b = buildChangeRequestBanners({ statusId: 'CANCELLED' }, { isEditable: false })
    const ro = b.find((x) => x.id === 'read-only')
    expect(ro).toBeDefined()
    expect(ro.tone).toBe('neutral')
    expect(ro.message.toLowerCase()).toContain('cancelled')
  })

  it('adds a read-only neutral banner when REJECTED and not editable', () => {
    const b = buildChangeRequestBanners({ statusId: 'REJECTED' }, { isEditable: false })
    const ro = b.find((x) => x.id === 'read-only')
    expect(ro).toBeDefined()
    expect(ro.tone).toBe('neutral')
    expect(ro.message.toLowerCase()).toContain('rejected')
  })

  it('no read-only banner when editable (DRAFT)', () => {
    const b = buildChangeRequestBanners({ statusId: 'DRAFT' }, { isEditable: true })
    expect(b.some((x) => x.id === 'read-only')).toBe(false)
  })

  it('no read-only banner when editable (OPEN)', () => {
    const b = buildChangeRequestBanners({ statusId: 'OPEN' }, { isEditable: true })
    expect(b.some((x) => x.id === 'read-only')).toBe(false)
  })

  it('no read-only banner when CLOSED but isEditable=true (edge case)', () => {
    const b = buildChangeRequestBanners({ statusId: 'CLOSED' }, { isEditable: true })
    expect(b.some((x) => x.id === 'read-only')).toBe(false)
  })
})

describe('buildChangeRequestSections', () => {
  it('always returns details, reason, workflow', () => {
    const s = buildChangeRequestSections({ statusId: 'DRAFT' })
    expect(s.map((x) => x.id)).toEqual(['details', 'reason', 'workflow'])
  })

  it('all sections have a label', () => {
    const s = buildChangeRequestSections({ statusId: 'OPEN' })
    s.forEach((section) => expect(section.label).toBeTruthy())
  })

  it('all sections are always visible (no conditional gating)', () => {
    const s = buildChangeRequestSections({ statusId: 'CLOSED' })
    s.forEach((section) => expect(section.visible).not.toBe(false))
  })
})

describe('buildChangeRequestActions', () => {
  const handlers = {
    openOpen() {},
    openClose() {},
    openCancel() {},
    print() {},
    openAudit() {},
    openDelete() {},
  }

  it('shows open (primary) on a DRAFT; close and cancel not visible', () => {
    const a = buildChangeRequestActions(
      { canOpen: true, canCloseCr: true, canCancel: true, canDeleteCr: true, canDelete: true, statusId: 'DRAFT', canClose: false, opening: false, closing: false, cancelling: false, deleting: false },
      handlers,
    )
    const visible = a.filter((x) => x.visible).map((x) => x.id)
    expect(visible).toContain('open')
    expect(visible).not.toContain('close')
    // cancel is also not visible for DRAFT (DRAFT is in the terminal list for notTerminal)
    expect(visible).not.toContain('cancel')
  })

  it('shows delete on a DRAFT when the user may delete when canDelete=true', () => {
    const a = buildChangeRequestActions(
      { canOpen: true, canCloseCr: true, canCancel: true, canDeleteCr: true, canDelete: true, statusId: 'DRAFT', canClose: false, opening: false, closing: false, cancelling: false, deleting: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'delete').visible).toBe(true)
  })

  it('hides delete when canDelete=false', () => {
    const a = buildChangeRequestActions(
      { canOpen: true, canCloseCr: true, canCancel: true, canDeleteCr: true, canDelete: false, statusId: 'DRAFT', canClose: false, opening: false, closing: false, cancelling: false, deleting: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'delete').visible).toBe(false)
  })

  it('shows close and cancel under review when the user holds the close verb', () => {
    const a = buildChangeRequestActions(
      { canOpen: true, canCloseCr: true, canCancel: true, canDeleteCr: true, canDelete: false, statusId: 'OPEN', canClose: true, opening: false, closing: false, cancelling: false, deleting: false },
      handlers,
    )
    const visible = a.filter((x) => x.visible).map((x) => x.id)
    expect(visible).toContain('close')
    expect(visible).toContain('cancel')
    expect(visible).not.toContain('open')
  })

  it('keeps close VISIBLE but disabled (with the reason) when canClose=false — CAPA parity', () => {
    const a = buildChangeRequestActions(
      { canOpen: true, canCloseCr: true, canCancel: true, canDeleteCr: true, canDelete: false, statusId: 'OPEN', canClose: false, closeDisabledReason: '2 workflow step(s) must be completed before this Change Request can be closed.', opening: false, closing: false, cancelling: false, deleting: false },
      handlers,
    )
    const close = a.find((x) => x.id === 'close')
    expect(close.visible).toBe(true)
    expect(close.disabled).toBe(true)
    expect(close.title).toMatch(/must be completed/)
  })

  it('hides every lifecycle action from a user who holds none of the verbs', () => {
    const a = buildChangeRequestActions(
      { canOpen: false, canCloseCr: false, canCancel: false, canDeleteCr: false, canDelete: true, statusId: 'DRAFT', canClose: false, opening: false, closing: false, cancelling: false, deleting: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'open').visible).toBe(false)
    expect(a.find((x) => x.id === 'delete').visible).toBe(false)
    expect(a.find((x) => x.id === 'audit').visible).toBe(false) // needs audit_trail:read
    expect(a.find((x) => x.id === 'print').visible).toBe(true) // always visible
  })

  // Audit Log is NOT implied by change_control:read — see `audit_log_select_rls`.
  it('shows Audit Log only with canViewAuditTrail', () => {
    const visible = (gates) =>
      buildChangeRequestActions(gates, handlers).find((x) => x.id === 'audit').visible
    expect(visible({ statusId: 'OPEN' })).toBe(false)
    expect(visible({ statusId: 'OPEN', canViewAuditTrail: true })).toBe(true)
  })

  it('open is disabled and loading while opening=true', () => {
    const a = buildChangeRequestActions(
      { canOpen: true, canCloseCr: true, canCancel: true, canDeleteCr: true, canDelete: false, statusId: 'DRAFT', canClose: false, opening: true, closing: false, cancelling: false, deleting: false },
      handlers,
    )
    const open = a.find((x) => x.id === 'open')
    expect(open.disabled).toBe(true)
    expect(open.loading).toBe(true)
  })

  it('close is disabled and loading while closing=true', () => {
    const a = buildChangeRequestActions(
      { canOpen: true, canCloseCr: true, canCancel: true, canDeleteCr: true, canDelete: false, statusId: 'OPEN', canClose: true, opening: false, closing: true, cancelling: false, deleting: false },
      handlers,
    )
    const close = a.find((x) => x.id === 'close')
    expect(close.disabled).toBe(true)
    expect(close.loading).toBe(true)
  })

  it('cancel is disabled and loading while cancelling=true', () => {
    const a = buildChangeRequestActions(
      { canOpen: true, canCloseCr: true, canCancel: true, canDeleteCr: true, canDelete: false, statusId: 'OPEN', canClose: true, opening: false, closing: false, cancelling: true, deleting: false },
      handlers,
    )
    const cancel = a.find((x) => x.id === 'cancel')
    expect(cancel.disabled).toBe(true)
    expect(cancel.loading).toBe(true)
  })

  it('delete is disabled and loading while deleting=true', () => {
    const a = buildChangeRequestActions(
      { canOpen: true, canCloseCr: true, canCancel: true, canDeleteCr: true, canDelete: true, statusId: 'DRAFT', canClose: false, opening: false, closing: false, cancelling: false, deleting: true },
      handlers,
    )
    const del = a.find((x) => x.id === 'delete')
    expect(del.disabled).toBe(true)
    expect(del.loading).toBe(true)
  })

  it('wires onSelect to the provided handlers', () => {
    let opened = false
    const a = buildChangeRequestActions(
      { canOpen: true, canCloseCr: true, canCancel: true, canDeleteCr: true, canDelete: false, statusId: 'DRAFT', canClose: false, opening: false, closing: false, cancelling: false, deleting: false },
      { ...handlers, openOpen() { opened = true } },
    )
    a.find((x) => x.id === 'open').onSelect()
    expect(opened).toBe(true)
  })

  it('cancel is not visible for CLOSED status (terminal)', () => {
    const a = buildChangeRequestActions(
      { canOpen: true, canCloseCr: true, canCancel: true, canDeleteCr: true, canDelete: false, statusId: 'CLOSED', canClose: false, opening: false, closing: false, cancelling: false, deleting: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'cancel').visible).toBe(false)
  })

  it('cancel is not visible for CANCELLED status (terminal)', () => {
    const a = buildChangeRequestActions(
      { canOpen: true, canCloseCr: true, canCancel: true, canDeleteCr: true, canDelete: false, statusId: 'CANCELLED', canClose: false, opening: false, closing: false, cancelling: false, deleting: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'cancel').visible).toBe(false)
  })

  it('cancel is visible for OPEN (non-terminal)', () => {
    const a = buildChangeRequestActions(
      { canOpen: true, canCloseCr: true, canCancel: true, canDeleteCr: true, canDelete: false, statusId: 'OPEN', canClose: false, opening: false, closing: false, cancelling: false, deleting: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'cancel').visible).toBe(true)
  })
})
