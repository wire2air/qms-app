import { describe, it, expect } from 'vitest'
import {
  buildSupplierBanners,
  buildSupplierSections,
  buildSupplierActions,
} from './supplierDetailConfig.js'

describe('buildSupplierBanners', () => {
  it('returns [] when supplier is null', () => {
    expect(buildSupplierBanners(null, {})).toEqual([])
  })

  it('adds a read-only neutral banner when INACTIVE and canUpdate is false', () => {
    const b = buildSupplierBanners({ statusId: 'INACTIVE' }, { canUpdate: false })
    const ro = b.find((x) => x.id === 'read-only')
    expect(ro).toBeDefined()
    expect(ro.tone).toBe('neutral')
    expect(ro.message.toLowerCase()).toContain('inactive')
  })

  it('no read-only banner when INACTIVE but canUpdate is true', () => {
    const b = buildSupplierBanners({ statusId: 'INACTIVE' }, { canUpdate: true })
    expect(b.some((x) => x.id === 'read-only')).toBe(false)
  })

  it('no read-only banner when ACTIVE', () => {
    const b = buildSupplierBanners({ statusId: 'ACTIVE' }, { canUpdate: false })
    expect(b.some((x) => x.id === 'read-only')).toBe(false)
  })
})

describe('buildSupplierSections', () => {
  it('always returns a single details section', () => {
    const s = buildSupplierSections(null)
    expect(s).toHaveLength(1)
    expect(s[0].id).toBe('details')
    expect(s[0].label).toBeTruthy()
  })

  it('has a label on the details section', () => {
    const s = buildSupplierSections({ statusId: 'ACTIVE' })
    expect(s[0].label).toBeTruthy()
  })
})

describe('buildSupplierActions', () => {
  it('returns an empty array', () => {
    expect(buildSupplierActions({}, {})).toEqual([])
  })

  it('accepts no arguments without throwing', () => {
    expect(() => buildSupplierActions()).not.toThrow()
  })
})
