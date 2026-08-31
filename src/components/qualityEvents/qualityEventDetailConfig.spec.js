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
    // Was asserted against 'IN_REVIEW' until 2026-08-31 — a status the
    // unified-statuses migration (20260823100000) deleted from the lookup, so
    // the test was passing on a value no row can hold. OPEN and DRAFT are the
    // only non-terminal states there are now.
    expect(buildQualityEventBanners({ statusId: 'OPEN' })).toEqual([])
    expect(buildQualityEventBanners({ statusId: 'DRAFT' })).toEqual([])
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

  it('returns submit, close, cancel, escalate, print and audit descriptors', () => {
    expect(buildQualityEventActions({}, {}).map((x) => x.id)).toEqual([
      'submit',
      'close',
      'cancel',
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
    expect(vis({ canEscalate: true, statusId: 'OPEN' })).toBe(true)
    expect(vis({ canEscalate: false, statusId: 'OPEN' })).toBe(false)
    // Escalating a DRAFT is legal server-side (escalateQualityEvent rejects only
    // CLOSED/CANCELLED), so the gate stays the broad not-terminal one.
    expect(vis({ canEscalate: true, statusId: 'DRAFT' })).toBe(true)
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
    const g = byId({ canClose: true, canEscalate: false, statusId: 'OPEN' })
    expect(g.close.visible).toBe(true)
    expect(g.escalate.visible).toBe(false)
  })

  it('close is visible only when canClose and the event is OPEN', () => {
    const vis = (gates) => byId(gates).close.visible
    expect(vis({ canClose: true, statusId: 'OPEN' })).toBe(true)
    expect(vis({ canClose: false, statusId: 'OPEN' })).toBe(false)
    expect(vis({ canClose: true, statusId: 'CLOSED' })).toBe(false)
    expect(vis({ canClose: true, statusId: 'CANCELLED' })).toBe(false)
    // NOT the broad not-terminal gate. OPEN->CLOSED is the only close edge the
    // lifecycle guard admits, so Close on a DRAFT would be a button the server
    // answers with a 409. Submit or Cancel are DRAFT's two exits.
    expect(vis({ canClose: true, statusId: 'DRAFT' })).toBe(false)
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
    buildQualityEventActions({}, { close })
      .find((x) => x.id === 'close')
      .onSelect()
    expect(close).toHaveBeenCalled()
  })

  // ── Cancel (2026-08-31) ────────────────────────────────────────────────────
  // POST /cancel is e-signed and gated on the same quality_events:update +
  // quality_events:close pair as Close, so it shares `canClose`. What it does
  // NOT share is the reviewer rule, and that is the whole point of giving it a
  // separate blocked reason.
  describe('cancel', () => {
    it('is visible only when canClose and the event is open', () => {
      const vis = (gates) => byId(gates).cancel.visible
      expect(vis({ canClose: true, statusId: 'OPEN' })).toBe(true)
      expect(vis({ canClose: true, statusId: 'DRAFT' })).toBe(true)
      expect(vis({ canClose: false, statusId: 'OPEN' })).toBe(false)
      expect(vis({ canClose: true, statusId: 'CLOSED' })).toBe(false)
      expect(vis({ canClose: true, statusId: 'CANCELLED' })).toBe(false)
    })

    it('disables Cancel with a reason when the event is assigned to someone else', () => {
      const a = byId({
        canClose: true,
        cancelBlockedReason: 'Only the assigned reviewer can cancel this event.',
        statusId: 'OPEN',
      }).cancel
      // Visible, like Close: this user holds the permission, so hiding the
      // button would read as a permissions bug rather than "you're not the
      // reviewer". The tooltip carries the actual rule.
      expect(a.visible).toBe(true)
      expect(a.disabled).toBe(true)
      expect(a.title).toBe('Only the assigned reviewer can cancel this event.')
    })

    it('leaves Cancel enabled for the assigned reviewer', () => {
      const a = byId({ canClose: true, cancelBlockedReason: '', statusId: 'OPEN' }).cancel
      expect(a.visible).toBe(true)
      expect(a.disabled).toBe(false)
      expect(a.title).toBeUndefined()
    })

    // The load-bearing difference between the two gates. An UNASSIGNED event
    // cannot be closed (the server takes only the assigned reviewer) but CAN be
    // cancelled by any close holder. If cancel reused `closeBlockedReason` it
    // would be disabled here with "assign a reviewer before closing" — telling
    // the user to assign a reviewer purely to earn the right to discard the event.
    it('stays enabled on an unassigned event even while Close is blocked', () => {
      const g = byId({
        canClose: true,
        closeBlockedReason: 'This event has no assigned reviewer yet — assign one before closing.',
        cancelBlockedReason: '',
        statusId: 'OPEN',
      })
      expect(g.close.disabled).toBe(true)
      expect(g.cancel.disabled).toBe(false)
      expect(g.cancel.title).toBeUndefined()
    })

    it('shows a loading spinner and disables itself while the cancel is in flight', () => {
      const a = byId({ canClose: true, statusId: 'OPEN', cancelling: true }).cancel
      expect(a.loading).toBe(true)
      expect(a.disabled).toBe(true)
    })

    it('is not loading when idle', () => {
      const a = byId({ canClose: true, statusId: 'OPEN' }).cancel
      expect(a.loading).toBe(false)
      expect(a.disabled).toBe(false)
    })

    it('is a danger action', () => {
      expect(byId({}).cancel.variant).toBe('danger')
    })

    it('wires the cancel handler to onSelect', () => {
      const cancel = vi.fn()
      buildQualityEventActions({}, { cancel })
        .find((x) => x.id === 'cancel')
        .onSelect()
      expect(cancel).toHaveBeenCalled()
    })
  })

  // ── Submit (2026-08-31) ────────────────────────────────────────────────────
  // POST /submit is the sole DRAFT → OPEN edge and the only lifecycle action
  // without an e-signature. Hidden outside DRAFT rather than disabled: there is
  // no "get yourself assigned and try again" story to tell, so a greyed button
  // on every OPEN event would be noise.
  describe('submit', () => {
    it('is visible only in DRAFT, and only with quality_events:update', () => {
      const vis = (gates) => byId(gates).submit.visible
      expect(vis({ canUpdate: true, statusId: 'DRAFT' })).toBe(true)
      expect(vis({ canUpdate: false, statusId: 'DRAFT' })).toBe(false)
      expect(vis({ statusId: 'DRAFT' })).toBe(false)
    })

    it('is invisible once the event has left DRAFT', () => {
      const vis = (statusId) => byId({ canUpdate: true, statusId }).submit.visible
      expect(vis('OPEN')).toBe(false)
      expect(vis('CLOSED')).toBe(false)
      expect(vis('CANCELLED')).toBe(false)
      // …and for an event whose status hasn't loaded yet.
      expect(vis(undefined)).toBe(false)
    })

    it('shows a loading spinner and disables itself while the submit is in flight', () => {
      const a = byId({ canUpdate: true, statusId: 'DRAFT', submitting: true }).submit
      expect(a.loading).toBe(true)
      expect(a.disabled).toBe(true)
    })

    it('is not loading when idle, and carries no blocked-reason tooltip', () => {
      const a = byId({ canUpdate: true, statusId: 'DRAFT' }).submit
      expect(a.loading).toBe(false)
      expect(a.disabled).toBe(false)
      expect(a.title).toBeUndefined()
    })

    // Submit and Close are mutually exclusive, and that is the point: DRAFT's
    // two exits are Submit and Cancel, OPEN's two are Close and Cancel. Close
    // used to ride the broad not-terminal gate and so appeared on DRAFT events
    // it could only 409 on; narrowed 2026-08-31 together with the server-side
    // `event.statusId !== 'OPEN'` conflict check that backs it.
    it('replaces Close in DRAFT, and is replaced by it once OPEN', () => {
      const draft = byId({ canUpdate: true, canClose: true, statusId: 'DRAFT' })
      expect(draft.submit.visible).toBe(true)
      expect(draft.close.visible).toBe(false)
      expect(draft.cancel.visible).toBe(true)
      const open = byId({ canUpdate: true, canClose: true, statusId: 'OPEN' })
      expect(open.submit.visible).toBe(false)
      expect(open.close.visible).toBe(true)
      expect(open.cancel.visible).toBe(true)
    })

    it('wires the submit handler to onSelect', () => {
      const submit = vi.fn()
      buildQualityEventActions({}, { submit })
        .find((x) => x.id === 'submit')
        .onSelect()
      expect(submit).toHaveBeenCalled()
    })
  })
})
