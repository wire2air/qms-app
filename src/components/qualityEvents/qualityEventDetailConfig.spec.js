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

  it('returns close, escalate, print and audit descriptors', () => {
    expect(buildQualityEventActions({}, {}).map((x) => x.id)).toEqual([
      'close',
      'escalate',
      'print',
      'audit',
    ])
  })

  // Escalation stopped being a status on 2026-08-18 — the event stays open and
  // is still closed the normal way — so "already escalated" comes from the
  // escalation link, and the button is disabled rather than hidden so the page
  // can say what it was escalated to.
  describe('escalate once', () => {
    it('is enabled while nothing has been escalated', () => {
      const a = byId({ canEscalate: true, statusId: 'OPEN' }).escalate
      expect(a.visible).toBe(true)
      expect(a.disabled).toBe(false)
      expect(a.title).toBeUndefined()
    })

    it('disables — but still shows — the button once escalated, naming the target', () => {
      const a = byId({ canEscalate: true, statusId: 'OPEN', escalatedTo: 'NC' }).escalate
      expect(a.visible).toBe(true)
      expect(a.disabled).toBe(true)
      expect(a.title).toBe('Already escalated to NC')
    })

    it('leaves Close available after escalating — the event is not resolved', () => {
      const g = byId({ canClose: true, canEscalate: true, statusId: 'OPEN', escalatedTo: 'CAPA' })
      expect(g.close.visible).toBe(true)
      expect(g.close.disabled).toBe(false)
    })
  })

  it('escalate is visible only when canEscalate and the event is open', () => {
    const vis = (gates) => byId(gates).escalate.visible
    expect(vis({ canEscalate: true, statusId: 'IN_REVIEW' })).toBe(true)
    expect(vis({ canEscalate: false, statusId: 'IN_REVIEW' })).toBe(false)
    expect(vis({ canEscalate: true, statusId: 'CLOSED' })).toBe(false)
    expect(vis({ canEscalate: true, statusId: 'CANCELLED' })).toBe(false)
  })

  // Reported 2026-08-18: a user holding quality_events:close who was NOT the
  // assigned reviewer saw an enabled Close button and got a 403 from
  // assertAssignedReviewer. `canClose` is "has a claim to close"; the server
  // only accepts the assigned reviewer, and `closeBlockedReason` carries that.
  describe('close is disabled, not broken, for a non-reviewer', () => {
    it('disables Close with a reason when the server would refuse', () => {
      const a = byId({
        canClose: true, // holds quality_events:close
        closeBlockedReason: 'Only the assigned reviewer can close this event.',
        statusId: 'OPEN',
      }).close
      // Still VISIBLE — this user does hold the permission; hiding it would
      // read as a permissions bug rather than "you're not the reviewer".
      expect(a.visible).toBe(true)
      expect(a.disabled).toBe(true)
      expect(a.title).toBe('Only the assigned reviewer can close this event.')
    })

    it('leaves Close enabled for the assigned reviewer', () => {
      const a = byId({ canClose: true, closeBlockedReason: '', statusId: 'OPEN' }).close
      expect(a.visible).toBe(true)
      expect(a.disabled).toBe(false)
      expect(a.title).toBeUndefined()
    })

    it('hides Close entirely from someone with no claim to it', () => {
      expect(byId({ canClose: false, statusId: 'OPEN' }).close.visible).toBe(false)
    })
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
