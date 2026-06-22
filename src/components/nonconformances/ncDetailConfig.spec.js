import { describe, it, expect } from 'vitest'
import { buildNcBanners, buildNcSections, buildNcActions } from './ncDetailConfig.js'

describe('buildNcBanners', () => {
  it('returns [] when nc is null', () => {
    expect(buildNcBanners(null, {})).toEqual([])
  })
  it('adds a QC-origin info banner with a link when sourceLot present', () => {
    const b = buildNcBanners({ statusId: 'DRAFT' }, { isEditable: true, sourceLot: { id: 'lot1', lotNumber: 'L-1' }, companyPath: (p) => `/c${p}` })
    const qc = b.find((x) => x.id === 'qc-origin')
    expect(qc.tone).toBe('info')
    expect(qc.actions[0].to).toContain('lot1')
  })
  it('adds a supplier-facing banner when isSupplierFacing', () => {
    const b = buildNcBanners({ statusId: 'UNDER_REVIEW', isSupplierFacing: true }, { isEditable: true })
    expect(b.some((x) => x.id === 'supplier-facing' && x.tone === 'info')).toBe(true)
  })
  it('adds a read-only banner when closed and not editable', () => {
    const b = buildNcBanners({ statusId: 'CLOSED' }, { isEditable: false })
    const ro = b.find((x) => x.id === 'read-only')
    expect(ro.tone).toBe('neutral')
    expect(ro.message.toLowerCase()).toContain('closed')
  })
  it('no read-only banner while editable', () => {
    const b = buildNcBanners({ statusId: 'UNDER_REVIEW' }, { isEditable: true })
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
  it('shows Open NC (primary) for a DRAFT owner, not Approve', () => {
    const a = buildNcActions({ isOwner: true, statusId: 'DRAFT', canMarkComplete: false, markCompleteBlockedReason: '', canConvert: false, saving: false }, handlers)
    const ids = a.filter((x) => x.visible).map((x) => x.id)
    expect(ids).toContain('open')
    expect(ids).toContain('delete')
    expect(ids).not.toContain('approve')
  })
  it('shows Approve & Close (disabled with reason) for an UNDER_REVIEW owner', () => {
    const a = buildNcActions({ isOwner: true, statusId: 'UNDER_REVIEW', canMarkComplete: false, markCompleteBlockedReason: 'Pick disposition', canConvert: true, saving: false }, handlers)
    const approve = a.find((x) => x.id === 'approve')
    expect(approve.visible).toBe(true)
    expect(approve.disabled).toBe(true)
    expect(approve.title).toBe('Pick disposition')
    expect(a.find((x) => x.id === 'convert').visible).toBe(true)
    expect(a.find((x) => x.id === 'open').visible).toBe(false)
  })
  it('hides owner-only actions for a non-owner', () => {
    const a = buildNcActions({ isOwner: false, statusId: 'DRAFT', canMarkComplete: false, markCompleteBlockedReason: '', canConvert: false, saving: false }, handlers)
    expect(a.find((x) => x.id === 'open').visible).toBe(false)
    expect(a.find((x) => x.id === 'delete').visible).toBe(false)
    expect(a.find((x) => x.id === 'audit').visible).toBe(true) // audit always available
  })
  it('wires onSelect to the provided handlers', () => {
    let opened = false
    const a = buildNcActions({ isOwner: true, statusId: 'DRAFT', canMarkComplete: false, markCompleteBlockedReason: '', canConvert: false, saving: false }, { ...handlers, openOpen: () => { opened = true } })
    a.find((x) => x.id === 'open').onSelect()
    expect(opened).toBe(true)
  })
})
