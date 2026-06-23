import { describe, it, expect, vi } from 'vitest'
import {
  buildTrainingInstanceBanners,
  buildTrainingInstanceSections,
  buildTrainingInstanceActions,
} from './trainingInstanceDetailConfig.js'

describe('buildTrainingInstanceBanners', () => {
  it('returns [] when instance is null', () => {
    expect(buildTrainingInstanceBanners(null)).toEqual([])
  })

  it('adds a cancelled banner with the reason when CANCELLED', () => {
    const b = buildTrainingInstanceBanners({ status: 'CANCELLED', cancelReason: 'Role changed' })
    const c = b.find((x) => x.id === 'cancelled')
    expect(c).toBeDefined()
    expect(c.tone).toBe('neutral')
    expect(c.message).toContain('Role changed')
  })

  it('cancelled banner without a reason still renders', () => {
    const b = buildTrainingInstanceBanners({ status: 'CANCELLED' })
    const c = b.find((x) => x.id === 'cancelled')
    expect(c).toBeDefined()
    expect(c.message.toLowerCase()).toContain('cancelled')
  })

  it('no banner when active', () => {
    expect(buildTrainingInstanceBanners({ status: 'ACTIVE' })).toEqual([])
  })
})

describe('buildTrainingInstanceSections', () => {
  it('always returns a single details section', () => {
    const s = buildTrainingInstanceSections(null)
    expect(s).toHaveLength(1)
    expect(s[0].id).toBe('details')
    expect(s[0].label).toBeTruthy()
  })
})

describe('buildTrainingInstanceActions', () => {
  it('returns verify + cancel descriptors', () => {
    const a = buildTrainingInstanceActions({}, {})
    expect(a.map((x) => x.id).sort()).toEqual(['cancel', 'verify'])
  })

  it('verify is visible only when canManage and needsVerification', () => {
    const verify = (gates) => buildTrainingInstanceActions(gates, {}).find((x) => x.id === 'verify')
    expect(verify({ canManage: true, needsVerification: true }).visible).toBe(true)
    expect(verify({ canManage: false, needsVerification: true }).visible).toBe(false)
    expect(verify({ canManage: true, needsVerification: false }).visible).toBe(false)
  })

  it('verify is the primary action', () => {
    const verify = buildTrainingInstanceActions({}, {}).find((x) => x.id === 'verify')
    expect(verify.variant).toBe('primary')
  })

  it('cancel is visible only when canManage and status is ACTIVE or PENDING_VERIFICATION', () => {
    const cancel = (gates) => buildTrainingInstanceActions(gates, {}).find((x) => x.id === 'cancel')
    expect(cancel({ canManage: true, status: 'ACTIVE' }).visible).toBe(true)
    expect(cancel({ canManage: true, status: 'PENDING_VERIFICATION' }).visible).toBe(true)
    expect(cancel({ canManage: true, status: 'COMPLETED' }).visible).toBe(false)
    expect(cancel({ canManage: false, status: 'ACTIVE' }).visible).toBe(false)
  })

  it('cancel reflects the cancelling loading flag', () => {
    const cancel = buildTrainingInstanceActions({ cancelling: true }, {}).find((x) => x.id === 'cancel')
    expect(cancel.disabled).toBe(true)
    expect(cancel.loading).toBe(true)
  })

  it('wires handlers to onSelect', () => {
    const verify = vi.fn()
    const openCancel = vi.fn()
    const a = buildTrainingInstanceActions({}, { verify, openCancel })
    a.find((x) => x.id === 'verify').onSelect()
    a.find((x) => x.id === 'cancel').onSelect()
    expect(verify).toHaveBeenCalled()
    expect(openCancel).toHaveBeenCalled()
  })
})
