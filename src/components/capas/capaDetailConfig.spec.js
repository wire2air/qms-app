import { describe, it, expect } from 'vitest'
import { buildCapaBanners, buildCapaSections, buildCapaActions } from './capaDetailConfig.js'

describe('buildCapaBanners', () => {
  it('returns [] when capa is null', () => {
    expect(buildCapaBanners(null, {})).toEqual([])
  })
  it('adds a supplier-facing info banner when isSupplierFacing', () => {
    const b = buildCapaBanners({ statusId: 'DRAFT', isSupplierFacing: true }, { isEditable: true })
    const sf = b.find((x) => x.id === 'supplier-facing')
    expect(sf).toBeDefined()
    expect(sf.tone).toBe('info')
  })
  it('does NOT add supplier-facing banner when isSupplierFacing is false', () => {
    const b = buildCapaBanners({ statusId: 'DRAFT', isSupplierFacing: false }, { isEditable: true })
    expect(b.some((x) => x.id === 'supplier-facing')).toBe(false)
  })
  it('adds a read-only neutral banner when CLOSED and not editable', () => {
    const b = buildCapaBanners({ statusId: 'CLOSED' }, { isEditable: false })
    const ro = b.find((x) => x.id === 'read-only')
    expect(ro).toBeDefined()
    expect(ro.tone).toBe('neutral')
    expect(ro.message.toLowerCase()).toContain('closed')
  })
  it('adds a read-only neutral banner when CANCELLED and not editable', () => {
    const b = buildCapaBanners({ statusId: 'CANCELLED' }, { isEditable: false })
    const ro = b.find((x) => x.id === 'read-only')
    expect(ro).toBeDefined()
    expect(ro.tone).toBe('neutral')
    expect(ro.message.toLowerCase()).toContain('cancelled')
  })
  it('no read-only banner when editable (PENDING)', () => {
    const b = buildCapaBanners({ statusId: 'PENDING' }, { isEditable: true })
    expect(b.some((x) => x.id === 'read-only')).toBe(false)
  })
  it('no QC-origin banner (CAPA uses RecordLineagePanel not banners)', () => {
    const b = buildCapaBanners({ statusId: 'DRAFT' }, { isEditable: true })
    expect(b.some((x) => x.id === 'qc-origin')).toBe(false)
  })
})

describe('buildCapaSections', () => {
  it('always returns details, workflow, effectiveness', () => {
    const s = buildCapaSections({ statusId: 'DRAFT' })
    expect(s.map((x) => x.id)).toEqual(['details', 'workflow', 'effectiveness'])
  })
  it('all sections have a label', () => {
    const s = buildCapaSections({ statusId: 'PENDING' })
    s.forEach((section) => expect(section.label).toBeTruthy())
  })
  it('all sections are always visible (no gating)', () => {
    const s = buildCapaSections({ statusId: 'CLOSED' })
    s.forEach((section) => expect(section.visible).not.toBe(false))
  })
})

describe('buildCapaActions', () => {
  const handlers = {
    openOpen() {},
    openClose() {},
    openCancel() {},
    print() {},
    createCr() {},
    openAudit() {},
    openDelete() {},
  }

  it('shows open (primary) for DRAFT owner; close and cancel not visible', () => {
    const a = buildCapaActions(
      { isOwner: true, statusId: 'DRAFT', canClose: true, closeDisabledReason: '', canCreateChangeRequest: false, saving: false },
      handlers,
    )
    const visible = a.filter((x) => x.visible).map((x) => x.id)
    expect(visible).toContain('open')
    expect(visible).not.toContain('close')
    expect(visible).not.toContain('cancel')
  })

  it('shows delete for DRAFT owner', () => {
    const a = buildCapaActions(
      { isOwner: true, statusId: 'DRAFT', canClose: true, closeDisabledReason: '', canCreateChangeRequest: false, saving: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'delete').visible).toBe(true)
  })

  it('shows close (primary) and cancel for PENDING owner; open not visible', () => {
    const a = buildCapaActions(
      { isOwner: true, statusId: 'PENDING', canClose: true, closeDisabledReason: '', canCreateChangeRequest: false, saving: false },
      handlers,
    )
    const visible = a.filter((x) => x.visible).map((x) => x.id)
    expect(visible).toContain('close')
    expect(visible).toContain('cancel')
    expect(visible).not.toContain('open')
  })

  it('close is disabled with tooltip when canClose=false', () => {
    const a = buildCapaActions(
      { isOwner: true, statusId: 'PENDING', canClose: false, closeDisabledReason: '2 steps still open.', canCreateChangeRequest: false, saving: false },
      handlers,
    )
    const close = a.find((x) => x.id === 'close')
    expect(close.visible).toBe(true)
    expect(close.disabled).toBe(true)
    expect(close.title).toBe('2 steps still open.')
  })

  it('close has no title when canClose=true and no closeDisabledReason', () => {
    const a = buildCapaActions(
      { isOwner: true, statusId: 'PENDING', canClose: true, closeDisabledReason: '', canCreateChangeRequest: false, saving: false },
      handlers,
    )
    const close = a.find((x) => x.id === 'close')
    expect(close.disabled).toBe(false)
    expect(close.title).toBeUndefined()
  })

  it('hides owner-only actions for a non-owner', () => {
    const a = buildCapaActions(
      { isOwner: false, statusId: 'DRAFT', canClose: false, closeDisabledReason: '', canCreateChangeRequest: false, saving: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'open').visible).toBe(false)
    expect(a.find((x) => x.id === 'delete').visible).toBe(false)
    expect(a.find((x) => x.id === 'audit').visible).toBe(true) // always visible
    expect(a.find((x) => x.id === 'print').visible).toBe(true) // always visible
  })

  it('open has loading=true and disabled=true while saving', () => {
    const a = buildCapaActions(
      { isOwner: true, statusId: 'DRAFT', canClose: false, closeDisabledReason: '', canCreateChangeRequest: false, saving: true },
      handlers,
    )
    const open = a.find((x) => x.id === 'open')
    expect(open.disabled).toBe(true)
    expect(open.loading).toBe(true)
  })

  it('wires onSelect to the provided handlers', () => {
    let opened = false
    const a = buildCapaActions(
      { isOwner: true, statusId: 'DRAFT', canClose: false, closeDisabledReason: '', canCreateChangeRequest: false, saving: false },
      { ...handlers, openOpen: () => { opened = true } },
    )
    a.find((x) => x.id === 'open').onSelect()
    expect(opened).toBe(true)
  })

  it('createCr visible when canCreateChangeRequest and status is not DRAFT', () => {
    const a = buildCapaActions(
      { isOwner: false, statusId: 'PENDING', canClose: false, closeDisabledReason: '', canCreateChangeRequest: true, saving: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'createCr').visible).toBe(true)
  })

  it('createCr NOT visible on DRAFT even when permission granted', () => {
    const a = buildCapaActions(
      { isOwner: false, statusId: 'DRAFT', canClose: false, closeDisabledReason: '', canCreateChangeRequest: true, saving: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'createCr').visible).toBe(false)
  })
})
