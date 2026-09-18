import { describe, it, expect } from 'vitest'
import { buildNcBanners, buildNcSections, buildNcActions } from './ncDetailConfig.js'

describe('buildNcBanners', () => {
  it('returns [] when nc is null', () => {
    expect(buildNcBanners(null, {})).toEqual([])
  })
  it('no qc-origin banner — the attached inspection report carries the context', () => {
    const b = buildNcBanners({ statusId: 'DRAFT' }, { isEditable: true, sourceLot: { id: 'lot1', lotNumber: 'L-1' }, companyPath: (p) => `/c${p}` })
    expect(b.some((x) => x.id === 'qc-origin')).toBe(false)
  })
  it('adds a supplier-facing banner when isSupplierFacing', () => {
    const b = buildNcBanners({ statusId: 'OPEN', isSupplierFacing: true }, { isEditable: true })
    expect(b.some((x) => x.id === 'supplier-facing' && x.tone === 'info')).toBe(true)
  })
  it('adds a read-only banner when closed and not editable', () => {
    const b = buildNcBanners({ statusId: 'CLOSED' }, { isEditable: false })
    const ro = b.find((x) => x.id === 'read-only')
    expect(ro.tone).toBe('neutral')
    expect(ro.message.toLowerCase()).toContain('closed')
  })
  it('no read-only banner while editable', () => {
    const b = buildNcBanners({ statusId: 'OPEN' }, { isEditable: true })
    expect(b.some((x) => x.id === 'read-only')).toBe(false)
  })
})

describe('buildNcSections', () => {
  it('always includes details/workflow/disposition', () => {
    const s = buildNcSections({ capaRequired: false })
    expect(s.map((x) => x.id)).toEqual(['details', 'workflow', 'disposition', 'capas'])
    expect(s.find((x) => x.id === 'capas').visible).toBe(false)
  })
  it('marks capas visible only when capaRequired', () => {
    expect(buildNcSections({ capaRequired: true }).find((x) => x.id === 'capas').visible).toBe(true)
  })
})

describe('buildNcActions', () => {
  const handlers = { openOpen() {}, openMarkComplete() {}, openDelete() {}, print() {}, openAudit() {}, openConvert() {} }
  it('shows Open NC (primary) on a DRAFT when the user may update, not Approve', () => {
    const a = buildNcActions({ canOpen: true, canClose: true, canDelete: true, statusId: 'DRAFT', canMarkComplete: false, markCompleteBlockedReason: '', canConvert: false, saving: false }, handlers)
    const ids = a.filter((x) => x.visible).map((x) => x.id)
    expect(ids).toContain('open')
    expect(ids).toContain('delete')
    expect(ids).not.toContain('approve')
  })
  it('shows Approve & Close (disabled with reason) when the user holds ncr:close', () => {
    const a = buildNcActions({ canOpen: true, canClose: true, canDelete: true, statusId: 'OPEN', canMarkComplete: false, markCompleteBlockedReason: 'Pick disposition', canConvert: true, saving: false }, handlers)
    const approve = a.find((x) => x.id === 'approve')
    expect(approve.visible).toBe(true)
    expect(approve.disabled).toBe(true)
    expect(approve.title).toBe('Pick disposition')
    expect(a.find((x) => x.id === 'convert').visible).toBe(true)
    expect(a.find((x) => x.id === 'open').visible).toBe(false)
  })
  it('hides every lifecycle action from a user who holds none of the verbs', () => {
    const a = buildNcActions({ canOpen: false, canClose: false, canDelete: false, statusId: 'DRAFT', canMarkComplete: false, markCompleteBlockedReason: '', canConvert: false, saving: false }, handlers)
    expect(a.find((x) => x.id === 'open').visible).toBe(false)
    expect(a.find((x) => x.id === 'delete').visible).toBe(false)
    expect(a.find((x) => x.id === 'audit').visible).toBe(false) // needs audit_trail:read
  })
  // Audit Log is NOT implied by ncr:read — `audit_log_select_rls` moved the
  // trail onto its own module, so without the grant the dialog has no rows and
  // only tells the user no.
  it('shows Audit Log only with canViewAuditTrail', () => {
    const visible = (gates) => buildNcActions(gates, handlers).find((x) => x.id === 'audit').visible
    expect(visible({ statusId: 'OPEN' })).toBe(false)
    expect(visible({ statusId: 'OPEN', canViewAuditTrail: true })).toBe(true)
  })
  it('gates each action on its OWN verb, independently', () => {
    // The rule that changed 2026-08-19. These were all one `isOwner` flag, so a
    // role granted ncr:close could not see Approve & Close unless it also owned
    // the record, and an owner WITHOUT ncr:close saw a button the API refuses.
    // Holding close must light up close and nothing else.
    const a = buildNcActions(
      { canOpen: false, canClose: true, canDelete: false, statusId: 'OPEN',
        canMarkComplete: true, markCompleteBlockedReason: null, canConvert: false, saving: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'approve').visible).toBe(true)
    expect(a.find((x) => x.id === 'delete').visible).toBe(false)
    expect(a.find((x) => x.id === 'open').visible).toBe(false)
  })
  it('wires onSelect to the provided handlers', () => {
    let opened = false
    const a = buildNcActions({ canOpen: true, canClose: true, canDelete: true, statusId: 'DRAFT', canMarkComplete: false, markCompleteBlockedReason: '', canConvert: false, saving: false }, { ...handlers, openOpen: () => { opened = true } })
    a.find((x) => x.id === 'open').onSelect()
    expect(opened).toBe(true)
  })
  it('approve action is disabled and loading while completing is true', () => {
    const a = buildNcActions({ canOpen: true, canClose: true, canDelete: true, statusId: 'OPEN', canMarkComplete: true, markCompleteBlockedReason: null, canConvert: false, saving: false, completing: true }, handlers)
    const approve = a.find((x) => x.id === 'approve')
    expect(approve.disabled).toBe(true)
    expect(approve.loading).toBe(true)
  })
  it('open action has loading=true while saving is true', () => {
    const a = buildNcActions({ canOpen: true, canClose: true, canDelete: true, statusId: 'DRAFT', canMarkComplete: false, markCompleteBlockedReason: '', canConvert: false, saving: true }, handlers)
    const open = a.find((x) => x.id === 'open')
    expect(open.disabled).toBe(true)
    expect(open.loading).toBe(true)
  })
})
