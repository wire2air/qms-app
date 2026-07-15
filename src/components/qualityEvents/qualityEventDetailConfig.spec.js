import { describe, it, expect, vi } from 'vitest'
import {
  buildQualityEventBanners,
  buildQualityEventSections,
  buildQualityEventActions,
} from './qualityEventDetailConfig.js'

describe('buildQualityEventBanners', () => {
  it('returns [] when event is null', () => {
    expect(buildQualityEventBanners(null)).toEqual([])
  })

  it('adds a status banner when CLOSED', () => {
    const b = buildQualityEventBanners({ statusId: 'CLOSED' })
    const s = b.find((x) => x.id === 'status')
    expect(s).toBeDefined()
    expect(s.title).toBe('Closed')
  })

  it('adds a status banner when CANCELLED', () => {
    const b = buildQualityEventBanners({ statusId: 'CANCELLED' })
    expect(b.find((x) => x.id === 'status')?.title).toBe('Cancelled')
  })

  it('no banner when open', () => {
    expect(buildQualityEventBanners({ statusId: 'IN_REVIEW' })).toEqual([])
  })
})

describe('buildQualityEventSections', () => {
  it('always returns a single details section', () => {
    const s = buildQualityEventSections(null)
    expect(s).toHaveLength(1)
    expect(s[0].id).toBe('details')
  })
})

describe('buildQualityEventActions', () => {
  const byId = (gates) =>
    Object.fromEntries(buildQualityEventActions(gates, {}).map((a) => [a.id, a]))

  it('returns close, escalate and audit descriptors', () => {
    expect(buildQualityEventActions({}, {}).map((x) => x.id)).toEqual([
      'close',
      'escalate',
      'audit',
    ])
  })

  it('escalate is visible only when canEscalate and the event is open', () => {
    const vis = (gates) => byId(gates).escalate.visible
    expect(vis({ canEscalate: true, statusId: 'IN_REVIEW' })).toBe(true)
    expect(vis({ canEscalate: false, statusId: 'IN_REVIEW' })).toBe(false)
    expect(vis({ canEscalate: true, statusId: 'CLOSED' })).toBe(false)
    expect(vis({ canEscalate: true, statusId: 'CANCELLED' })).toBe(false)
  })

  // Regression: close and escalate shared one `canOwnerActions` gate, so a role
  // granted every quality_events capability still saw neither unless it happened
  // to be the assigned reviewer.
  it('gates close independently of escalate', () => {
    const g = byId({ canClose: true, canEscalate: false, statusId: 'IN_REVIEW' })
    expect(g.close.visible).toBe(true)
    expect(g.escalate.visible).toBe(false)
  })

  it('close is visible only when canClose and the event is open', () => {
    const vis = (gates) => byId(gates).close.visible
    expect(vis({ canClose: true, statusId: 'IN_REVIEW' })).toBe(true)
    expect(vis({ canClose: false, statusId: 'IN_REVIEW' })).toBe(false)
    expect(vis({ canClose: true, statusId: 'CLOSED' })).toBe(false)
  })

  it('escalate is a primary action', () => {
    expect(byId({}).escalate.variant).toBe('primary')
  })

  it('wires the escalate handler to onSelect', () => {
    const escalate = vi.fn()
    const a = buildQualityEventActions({}, { escalate }).find((x) => x.id === 'escalate')
    a.onSelect()
    expect(escalate).toHaveBeenCalled()
  })

  it('wires the close handler to onSelect', () => {
    const close = vi.fn()
    buildQualityEventActions({}, { close }).find((x) => x.id === 'close').onSelect()
    expect(close).toHaveBeenCalled()
  })
})
