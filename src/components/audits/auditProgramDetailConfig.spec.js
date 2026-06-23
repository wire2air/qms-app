import { describe, it, expect, vi } from 'vitest'
import {
  buildAuditProgramBanners,
  buildAuditProgramSections,
  buildAuditProgramActions,
} from './auditProgramDetailConfig.js'

describe('buildAuditProgramBanners', () => {
  it('returns [] when program is null', () => {
    expect(buildAuditProgramBanners(null)).toEqual([])
  })

  it('adds a paused banner when the program is inactive', () => {
    const b = buildAuditProgramBanners({ active: false })
    const p = b.find((x) => x.id === 'paused')
    expect(p).toBeDefined()
    expect(p.tone).toBe('neutral')
    expect(p.message.toLowerCase()).toContain('paused')
  })

  it('no banner when the program is active', () => {
    expect(buildAuditProgramBanners({ active: true })).toEqual([])
  })
})

describe('buildAuditProgramSections', () => {
  it('always returns a single details section', () => {
    const s = buildAuditProgramSections(null)
    expect(s).toHaveLength(1)
    expect(s[0].id).toBe('details')
    expect(s[0].label).toBeTruthy()
  })
})

describe('buildAuditProgramActions', () => {
  it('returns a single delete descriptor', () => {
    const a = buildAuditProgramActions({}, {})
    expect(a.map((x) => x.id)).toEqual(['delete'])
  })

  it('delete is visible only when canDelete', () => {
    expect(buildAuditProgramActions({ canDelete: true }, {})[0].visible).toBe(true)
    expect(buildAuditProgramActions({ canDelete: false }, {})[0].visible).toBe(false)
  })

  it('delete is a danger action', () => {
    expect(buildAuditProgramActions({ canDelete: true }, {})[0].variant).toBe('danger')
  })

  it('delete reflects the deleting flag', () => {
    expect(buildAuditProgramActions({ canDelete: true, deleting: true }, {})[0].disabled).toBe(true)
  })

  it('wires the openDelete handler to onSelect', () => {
    const openDelete = vi.fn()
    buildAuditProgramActions({}, { openDelete })[0].onSelect()
    expect(openDelete).toHaveBeenCalled()
  })
})
