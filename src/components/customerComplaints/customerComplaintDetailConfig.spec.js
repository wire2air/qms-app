import { describe, it, expect } from 'vitest'
import {
  buildComplaintBanners,
  buildComplaintSections,
  buildComplaintActions,
} from './customerComplaintDetailConfig.js'

describe('buildComplaintBanners', () => {
  it('returns [] when complaint is null', () => {
    expect(buildComplaintBanners(null, {})).toEqual([])
  })

  it('adds a read-only neutral banner when CLOSED and not editable', () => {
    const b = buildComplaintBanners({ statusId: 'CLOSED' }, { isEditable: false })
    const ro = b.find((x) => x.id === 'read-only')
    expect(ro).toBeDefined()
    expect(ro.tone).toBe('neutral')
    expect(ro.message.toLowerCase()).toContain('closed')
  })

  it('adds a read-only neutral banner when CONVERTED_TO_NC and not editable', () => {
    const b = buildComplaintBanners({ statusId: 'CONVERTED_TO_NC' }, { isEditable: false })
    const ro = b.find((x) => x.id === 'read-only')
    expect(ro).toBeDefined()
    expect(ro.tone).toBe('neutral')
    expect(ro.message.toLowerCase()).toContain('converted')
  })

  it('no read-only banner when editable (OPEN)', () => {
    const b = buildComplaintBanners({ statusId: 'OPEN' }, { isEditable: true })
    expect(b.some((x) => x.id === 'read-only')).toBe(false)
  })

  it('no read-only banner when CLOSED but isEditable=true (edge case)', () => {
    const b = buildComplaintBanners({ statusId: 'CLOSED' }, { isEditable: true })
    expect(b.some((x) => x.id === 'read-only')).toBe(false)
  })

  it('no read-only banner for non-terminal statuses', () => {
    for (const statusId of ['NEW', 'OPEN', 'ON_HOLD', 'RESOLVED']) {
      const b = buildComplaintBanners({ statusId }, { isEditable: false })
      expect(b.some((x) => x.id === 'read-only')).toBe(false)
    }
  })
})

describe('buildComplaintSections', () => {
  it('always returns a details section', () => {
    const s = buildComplaintSections({ statusId: 'OPEN' })
    expect(s.map((x) => x.id)).toEqual(['details'])
  })

  it('all sections have a label', () => {
    const s = buildComplaintSections({ statusId: 'CLOSED' })
    s.forEach((section) => expect(section.label).toBeTruthy())
  })

  it('all sections are always visible (no gating)', () => {
    const s = buildComplaintSections({ statusId: 'CONVERTED_TO_NC' })
    s.forEach((section) => expect(section.visible).not.toBe(false))
  })
})

describe('buildComplaintActions', () => {
  const handlers = {
    accept() {},
    openAssign() {},
    resolve() {},
    hold() {},
    openClose() {},
    reopen() {},
    openConvert() {},
    openAudit() {},
  }

  it('accept visible for editable complaint with no assignee', () => {
    const a = buildComplaintActions(
      { isEditable: true, canUpdate: true, canConvert: false, statusId: 'NEW', acting: false, hasAssignee: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'accept').visible).toBe(true)
  })

  it('accept NOT visible when complaint has assignee', () => {
    const a = buildComplaintActions(
      { isEditable: true, canUpdate: true, canConvert: false, statusId: 'OPEN', acting: false, hasAssignee: true },
      handlers,
    )
    expect(a.find((x) => x.id === 'accept').visible).toBe(false)
  })

  it('assign visible for editable complaint; label is "Assign" when no assignee', () => {
    const a = buildComplaintActions(
      { isEditable: true, canUpdate: true, canConvert: false, statusId: 'OPEN', acting: false, hasAssignee: false },
      handlers,
    )
    const assign = a.find((x) => x.id === 'assign')
    expect(assign.visible).toBe(true)
    expect(assign.label).toBe('Assign')
  })

  it('assign label is "Reassign" when hasAssignee=true', () => {
    const a = buildComplaintActions(
      { isEditable: true, canUpdate: true, canConvert: false, statusId: 'OPEN', acting: false, hasAssignee: true },
      handlers,
    )
    expect(a.find((x) => x.id === 'assign').label).toBe('Reassign')
  })

  it('resolve NOT visible when statusId is already RESOLVED', () => {
    const a = buildComplaintActions(
      { isEditable: true, canUpdate: true, canConvert: false, statusId: 'RESOLVED', acting: false, hasAssignee: true },
      handlers,
    )
    expect(a.find((x) => x.id === 'resolve').visible).toBe(false)
  })

  it('hold NOT visible when statusId is already ON_HOLD', () => {
    const a = buildComplaintActions(
      { isEditable: true, canUpdate: true, canConvert: false, statusId: 'ON_HOLD', acting: false, hasAssignee: true },
      handlers,
    )
    expect(a.find((x) => x.id === 'hold').visible).toBe(false)
  })

  it('reopen visible for canUpdate when CLOSED', () => {
    const a = buildComplaintActions(
      { isEditable: false, canUpdate: true, canConvert: false, statusId: 'CLOSED', acting: false, hasAssignee: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'reopen').visible).toBe(true)
  })

  it('reopen visible for canUpdate when RESOLVED', () => {
    const a = buildComplaintActions(
      { isEditable: false, canUpdate: true, canConvert: false, statusId: 'RESOLVED', acting: false, hasAssignee: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'reopen').visible).toBe(true)
  })

  it('reopen NOT visible for non-terminal statuses', () => {
    const a = buildComplaintActions(
      { isEditable: true, canUpdate: true, canConvert: false, statusId: 'OPEN', acting: false, hasAssignee: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'reopen').visible).toBe(false)
  })

  it('convertToNc visible when canConvert=true and not already CONVERTED_TO_NC', () => {
    const a = buildComplaintActions(
      { isEditable: true, canUpdate: true, canConvert: true, statusId: 'OPEN', acting: false, hasAssignee: true },
      handlers,
    )
    expect(a.find((x) => x.id === 'convertToNc').visible).toBe(true)
  })

  it('convertToNc NOT visible when status is CONVERTED_TO_NC', () => {
    const a = buildComplaintActions(
      { isEditable: false, canUpdate: true, canConvert: true, statusId: 'CONVERTED_TO_NC', acting: false, hasAssignee: true },
      handlers,
    )
    expect(a.find((x) => x.id === 'convertToNc').visible).toBe(false)
  })

  it('audit is always visible', () => {
    const a = buildComplaintActions(
      { isEditable: false, canUpdate: false, canConvert: false, statusId: 'CLOSED', acting: false, hasAssignee: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'audit').visible).toBe(true)
  })

  it('all actions are disabled and accept shows loading when acting=true', () => {
    const a = buildComplaintActions(
      { isEditable: true, canUpdate: true, canConvert: true, statusId: 'OPEN', acting: true, hasAssignee: false },
      handlers,
    )
    const accept = a.find((x) => x.id === 'accept')
    expect(accept.disabled).toBe(true)
    expect(accept.loading).toBe(true)
    expect(a.find((x) => x.id === 'assign').disabled).toBe(true)
  })

  it('hides editable-only actions when isEditable=false', () => {
    const a = buildComplaintActions(
      { isEditable: false, canUpdate: false, canConvert: false, statusId: 'NEW', acting: false, hasAssignee: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'accept').visible).toBe(false)
    expect(a.find((x) => x.id === 'assign').visible).toBe(false)
    expect(a.find((x) => x.id === 'close').visible).toBe(false)
    expect(a.find((x) => x.id === 'audit').visible).toBe(true)
  })

  it('wires onSelect to the provided handlers', () => {
    let auditOpened = false
    const a = buildComplaintActions(
      { isEditable: false, canUpdate: false, canConvert: false, statusId: 'CLOSED', acting: false, hasAssignee: false },
      { ...handlers, openAudit() { auditOpened = true } },
    )
    a.find((x) => x.id === 'audit').onSelect()
    expect(auditOpened).toBe(true)
  })
})
