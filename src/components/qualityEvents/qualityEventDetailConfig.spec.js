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
  it('returns a single escalate descriptor', () => {
    expect(buildQualityEventActions({}, {}).map((x) => x.id)).toEqual(['escalate'])
  })

  it('escalate is visible only when canUpdate and the event is open', () => {
    const vis = (gates) => buildQualityEventActions(gates, {})[0].visible
    expect(vis({ canUpdate: true, statusId: 'IN_REVIEW' })).toBe(true)
    expect(vis({ canUpdate: false, statusId: 'IN_REVIEW' })).toBe(false)
    expect(vis({ canUpdate: true, statusId: 'CLOSED' })).toBe(false)
    expect(vis({ canUpdate: true, statusId: 'CANCELLED' })).toBe(false)
  })

  it('escalate is the primary action', () => {
    expect(buildQualityEventActions({}, {})[0].variant).toBe('primary')
  })

  it('wires the escalate handler to onSelect', () => {
    const escalate = vi.fn()
    buildQualityEventActions({}, { escalate })[0].onSelect()
    expect(escalate).toHaveBeenCalled()
  })
})
