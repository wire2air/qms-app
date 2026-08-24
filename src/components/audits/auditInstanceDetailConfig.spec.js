import { describe, it, expect, vi } from 'vitest'
import {
  buildAuditInstanceBanners,
  buildAuditInstanceTabs,
  buildAuditInstanceActions,
} from './auditInstanceDetailConfig.js'

describe('buildAuditInstanceBanners', () => {
  it('returns [] when audit is null', () => {
    expect(buildAuditInstanceBanners(null)).toEqual([])
  })

  it('read-only banner when CLOSED', () => {
    const b = buildAuditInstanceBanners({ statusId: 'CLOSED' })
    expect(b.find((x) => x.id === 'read-only')?.title).toBe('Closed')
  })

  it('read-only banner when CANCELLED', () => {
    const b = buildAuditInstanceBanners({ statusId: 'CANCELLED' })
    expect(b.find((x) => x.id === 'read-only')?.title).toBe('Cancelled')
  })

  it('info banner when REVIEW', () => {
    const b = buildAuditInstanceBanners({ statusId: 'REVIEW' })
    expect(b.find((x) => x.id === 'in-review')?.tone).toBe('info')
  })

  it('no banner while IN_PROGRESS', () => {
    expect(buildAuditInstanceBanners({ statusId: 'IN_PROGRESS' })).toEqual([])
  })
})

describe('buildAuditInstanceTabs', () => {
  it('returns the five panel tabs with counts', () => {
    const t = buildAuditInstanceTabs({
      clauseCount: 13,
      findingsTotal: 2,
      ofiCount: 1,
      reportCount: 3,
    })
    expect(t.map((x) => x.value)).toEqual(['info', 'requirements', 'findings', 'ofi', 'reports'])
    expect(t.find((x) => x.value === 'requirements').count).toBe(13)
    expect(t.find((x) => x.value === 'findings').count).toBe(2)
    expect(t.find((x) => x.value === 'ofi').count).toBe(1)
    expect(t.find((x) => x.value === 'reports').count).toBe(3)
  })

  it('all tabs are panel-mode and keep-alive (lazy:false)', () => {
    buildAuditInstanceTabs().forEach((t) => {
      expect(t.mode).toBe('panel')
      expect(t.lazy).toBe(false)
    })
  })

  it('locks supplier audits to Information only', () => {
    const t = buildAuditInstanceTabs({ supplierTabsLocked: true })
    expect(t.map((x) => x.value)).toEqual(['info'])
  })
})

describe('buildAuditInstanceActions', () => {
  const visibleIds = (gates) =>
    buildAuditInstanceActions(gates, {})
      .filter((a) => a.visible)
      .map((a) => a.id)

  it('Report and Audit Log are always available', () => {
    expect(visibleIds({})).toEqual(expect.arrayContaining(['report', 'auditLog']))
  })

  it('Start only when canStart', () => {
    expect(visibleIds({ canStart: true })).toContain('start')
    expect(visibleIds({})).not.toContain('start')
  })

  it('Release only for a supplier audit not yet released', () => {
    expect(visibleIds({ canRelease: true })).toContain('release')
    expect(visibleIds({ canRelease: true, isReleased: true })).not.toContain('release')
  })

  it('Submit is gated on canSubmitForCloseOut', () => {
    expect(visibleIds({ canSubmitForCloseOut: true })).toContain('submit')
    expect(visibleIds({})).not.toContain('submit')
  })

  it('Submit is disabled + labelled when requirements are unassessed', () => {
    const s = buildAuditInstanceActions(
      { canSubmitForCloseOut: true, unassessedCount: 3 },
      {},
    ).find((a) => a.id === 'submit')
    expect(s.disabled).toBe(true)
    expect(s.label).toContain('3 unassessed')
    expect(s.title.toLowerCase()).toContain('assess')
  })

  it('Submit is disabled + labelled when findings are open', () => {
    const s = buildAuditInstanceActions(
      { canSubmitForCloseOut: true, findingsOpen: 2 },
      {},
    ).find((a) => a.id === 'submit')
    expect(s.disabled).toBe(true)
    expect(s.label).toContain('2 open')
  })

  it('Submit is enabled with a clean label when ready', () => {
    const s = buildAuditInstanceActions({ canSubmitForCloseOut: true }, {}).find(
      (a) => a.id === 'submit',
    )
    expect(s.disabled).toBe(false)
    expect(s.label).toBe('Submit for Close-Out')
  })

  it('Delete only when canDelete and not CLOSED', () => {
    expect(visibleIds({ canDelete: true, statusId: 'IN_PROGRESS' })).toContain('delete')
    expect(visibleIds({ canDelete: true, statusId: 'CLOSED' })).not.toContain('delete')
  })

  it('wires handlers to onSelect', () => {
    const handlers = {
      release: vi.fn(),
      start: vi.fn(),
      openSubmit: vi.fn(),
      report: vi.fn(),
      openCancel: vi.fn(),
      openAuditLog: vi.fn(),
      openDelete: vi.fn(),
    }
    const a = buildAuditInstanceActions({}, handlers)
    a.forEach((d) => d.onSelect && d.onSelect())
    Object.values(handlers).forEach((fn) => expect(fn).toHaveBeenCalled())
  })
})
