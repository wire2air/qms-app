// QE-J3 — QE-H1: closing a quality event is a Part-11 signed act.
//
// THE FINDING (docs/modules/quality-events/17-missing-coverage-report.md P1 #7,
// 19-production-readiness.md release condition 1). Closing an event is the
// module's regulated terminal act: it asserts that the three mandatory review
// fields are complete and that the ASSIGNED REVIEWER stands behind the decision.
// It was performed with no identity re-verification and no signature at all —
// `closeQualityEvent` checked the reviewer, checked the fields, flipped
// `status_id` and wrote an AuditLog row.
//
// The pack recorded this as "not merely absent but UNREPRESENTABLE": the
// exactly-one-subject CHECK on `signatures` admitted nine subjects and a quality
// event was not among them, so there was no column a QE-level signature could
// hang off. Every peer terminal act in the platform already had one — CAPA-H2,
// NCR-H2, CR-H2, module records, step-level acts.
//
// Migration 20260831120000 adds `signatures.quality_event_id` and widens the
// CHECK to ten arms; the controller signs before it moves the status, inside
// `req.transaction`, so a refused signature leaves the event untouched and a
// rolled-back close leaves no orphan signature.
//
// ── What only this file can prove ───────────────────────────────────────────
// The integration tests cover the controller. What they cannot reach is the
// round trip: that the header action opens the real
// `workflowInstanceEsignAuthDialog`, that the PIN the signer types is
// authenticated against `users.esign_pin_hash`, and that the triple the SPA
// forwards is the triple the endpoint expects. A close that silently posted
// `{}` — which is exactly what this page did until 2026-08-31 — would pass every
// controller unit test that stubs the request body.
//
// THE LEDGER IS THE ASSERTION, not the status. A status flip with no signature
// row is the defect, and it looks identical from the UI.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, QUALITY_EVENTS, ESIGN_PIN } from '../fixtures/cast.js'
import {
  openEvent,
  actionBarButton,
  closeViaUi,
  statusOf,
  statusLabel,
  waitForStatus,
  signatureRowsFor,
  auditRowsFor,
  resetLifecycleEvents,
  resetStandingEvent,
} from '../fixtures/qualityEvents.js'

// EV-E2E-0002 — OPEN, assigned to qeManager, review fields PRE-FILLED by the
// seed so the journey drives Close and nothing else. Typing three rich-text
// fields through TipTap would make this a rich-text test that happens to end in
// a signature.
const CLOSE_EV = QUALITY_EVENTS.close
// EV-E2E-0001 — the standing event: assigned to qeManager since seed §28e, but
// its three review fields are NULL. That combination is the whole point. The
// controller checks the reviewer FIRST and the fields SECOND, so on an
// UNASSIGNED event the field gate is unreachable and cannot be tested; and with
// qeManager assigned the Close button is ENABLED, so when the close is refused
// the refusal demonstrably comes from the server, not from a greyed control.
const EMPTY_EV = QUALITY_EVENTS.standing
// EV-E2E-0005 — OPEN, review fields complete, assigned to deptAdmin. Complete
// fields are deliberate: they remove every other reason a close could fail, so
// the assigned-reviewer rule is the only gate left standing.
const FOREIGN_EV = QUALITY_EVENTS.foreignReviewer

const REVIEWER = USERS.qeManager

test.describe('QE-J3 — close requires an e-signature (QE-H1)', () => {
  // qeManager holds quality_events read/update/close at tenant scope AND — since
  // seed §28d — an e-sign PIN. Without the PIN this suite would not fail with a
  // signing error: `workflowInstanceEsignAuthDialog` asks
  // GET /v1/services/verify-identity on open and, seeing `hasPin: false`,
  // renders the "Set your PIN" form instead of the "Enter your PIN" one. The
  // journey would time out on a placeholder that does not exist, which reads as
  // a broken selector rather than as a persona that cannot sign.
  test.use({ storageState: AUTH.qeManager })

  // Both resets, every test. Close is TERMINAL and the guard now refuses the way
  // back on the trusted path too, so a run that ends CLOSED cannot be re-run
  // without them — and a test that crashes mid-journey never reaches its own
  // cleanup, so `afterAll` alone would let one failure poison the next run.
  test.beforeEach(() => {
    resetLifecycleEvents()
    resetStandingEvent()
  })
  test.afterAll(() => {
    resetLifecycleEvents()
    resetStandingEvent()
  })

  test('the assigned reviewer closes with an e-signature, and the ledger records it', async ({
    page,
  }) => {
    test.setTimeout(120_000)

    // Start from a known-empty signature ledger, so "exactly one" below is a
    // statement about this close and not about how many times the suite has run.
    expect(signatureRowsFor(CLOSE_EV.id), 'no signature before the close').toEqual([])
    expect(statusOf(CLOSE_EV.id)).toBe('OPEN')
    // Audit rows are a different matter: `prevent_audit_log_mutation()` refuses
    // DELETE on `audit_logs` for every role, superuser included, so the reset
    // cannot clear them and an absolute count would be `1` on the first run and
    // `2` on the second. Baseline now, assert the delta after.
    const closeRowsBefore = auditRowsFor(CLOSE_EV.id, 'CLOSE').length

    await openEvent(page, CLOSE_EV.id)

    // The three mandatory review fields are already complete (seed §28f), which
    // is what makes Close reachable at all — the controller refuses without them
    // and the negative below proves it.
    await expect(actionBarButton(page, 'Close')).toBeEnabled({ timeout: 20_000 })
    await closeViaUi(page)

    await waitForStatus(CLOSE_EV.id, 'CLOSED')

    // ── THE LEDGER ────────────────────────────────────────────────────────
    // This block is the reason the file exists, and it is also the block that
    // cannot even RUN without migration 20260831120000: `signatureRowsFor`
    // selects `signatures.quality_event_id` by name, so reverting that migration
    // fails here with `column "quality_event_id" does not exist` rather than
    // with a soft assertion — the loudest available signal, and the correct one,
    // because without the column a QE signature is not missing, it is
    // impossible to write.
    const signatures = signatureRowsFor(CLOSE_EV.id)
    expect(signatures, 'exactly one Part-11 signature for this close').toHaveLength(1)
    expect(signatures[0].meaning, "meaning is the act, not the outcome").toBe('CLOSED')
    expect(signatures[0].userId, 'attributed to the signer who typed the PIN').toBe(REVIEWER.id)
    // A signature with no payload hash is a name on a page with nothing bound to
    // it — the manifest is what makes the record tamper-evident, so its absence
    // is a failed signature even though a row exists.
    expect(signatures[0].payloadHash, 'the signature manifest is hashed').toBeTruthy()

    // ── THE AUDIT TRAIL ───────────────────────────────────────────────────
    // Separate from the signature and not derivable from it: the signature says
    // who attested, the audit row says what happened to the record. The status
    // trigger records field changes, but "the event was CLOSED, by this person,
    // under this signature" is an explicit CLOSE row the controller writes.
    const closeRows = auditRowsFor(CLOSE_EV.id, 'CLOSE')
    expect(closeRows.length, 'exactly one NEW CLOSE audit row').toBe(closeRowsBefore + 1)
    const closeRow = closeRows.at(-1)
    expect(closeRow.performedBy, 'attributed CLOSE').toBe(REVIEWER.id)
    expect(closeRow.newValue.statusId).toBe('CLOSED')
    // The audit row points AT the signature, by id. Without this the two ledgers
    // are two unrelated facts about the same second and an auditor cannot tie
    // the attestation to the act — which is the whole purpose of both.
    expect(
      closeRow.newValue.signatureId,
      'the audit row cites the signature it was made under',
    ).toBe(signatures[0].id)

    // ── THE UI AGREES ─────────────────────────────────────────────────────
    // A closed event is terminal, so its lifecycle actions are gone rather than
    // disabled: every one of them is gated on `isOpen` in
    // qualityEventDetailConfig.js.
    await openEvent(page, CLOSE_EV.id)
    await expect(statusLabel(page, 'Closed')).toBeVisible({ timeout: 20_000 })
    for (const label of ['Close', 'Cancel', 'Escalate']) {
      await expect(
        page.getByRole('button', { name: label, exact: true }),
        `${label} is not offered on a closed event`,
      ).toHaveCount(0)
    }
  })

  test('negative: closing with the review fields empty is refused, and nothing moves', async ({
    page,
  }) => {
    test.setTimeout(120_000)

    // The standing event: same reviewer, no review. The button is offered and
    // enabled — correctly, because this user IS allowed to close this event
    // once the review exists — so the refusal has to come from the server.
    expect(statusOf(EMPTY_EV.id)).toBe('OPEN')
    const closeRowsBefore = auditRowsFor(EMPTY_EV.id, 'CLOSE').length
    await openEvent(page, EMPTY_EV.id)
    await expect(actionBarButton(page, 'Close')).toBeEnabled({ timeout: 20_000 })

    // Drive the FULL flow, PIN included. Stopping before the signature would
    // only prove that a dialog opens; the claim under test is that a correctly
    // signed request is still refused when the review is missing — i.e. that the
    // signature is not a substitute for the review.
    await closeViaUi(page)

    // Nothing moved, and — just as important — NOTHING WAS SIGNED. The
    // controller validates the three fields BEFORE it calls verifyAndSign, so a
    // signature row here would mean the signer had attested to a close that
    // never happened, which is worse than the close succeeding.
    expect(statusOf(EMPTY_EV.id), 'the event is still open').toBe('OPEN')
    expect(signatureRowsFor(EMPTY_EV.id), 'no signature was filed').toEqual([])
    expect(auditRowsFor(EMPTY_EV.id, 'CLOSE').length, 'no CLOSE was recorded').toBe(
      closeRowsBefore,
    )
    await expect(statusLabel(page, 'Open')).toBeVisible({ timeout: 20_000 })

    // And the server says WHY, in words a user can act on. Asserted against the
    // endpoint rather than against the toast because the toast auto-dismisses
    // after 3 s — a race, not a contract. The three fields are checked in order,
    // so Review Summary is the one that reports first.
    const res = await page.request.post(`/api/v1/services/qualityEvents/${EMPTY_EV.id}/close`, {
      data: { method: 'PIN', token: ESIGN_PIN, provider: null, comments: null },
    })
    expect(res.status(), 'a close with no review is a 400, not a 500').toBe(400)
    const body = await res.json().catch(() => null)
    expect(body?.error?.message ?? '').toMatch(/Complete Review Summary/i)
  })

  test('negative: a close-holder who is not the assigned reviewer cannot close', async ({
    page,
  }) => {
    test.setTimeout(120_000)

    // qeManager holds `quality_events:close` at tenant scope, so `canClose` is
    // true and the button RENDERS — which is the deliberate design. Hiding it
    // would tell a user who genuinely holds the permission that they do not.
    // What stops them is `closeBlockedReason`, the frontend's mirror of
    // assertAssignedReviewer.
    await openEvent(page, FOREIGN_EV.id)

    const close = actionBarButton(page, 'Close')
    await expect(close, 'the button is offered to a close-holder').toBeVisible({ timeout: 20_000 })
    await expect(close, 'but not usable by a non-reviewer').toBeDisabled()
    // The tooltip is the actionable half: before 2026-08-18 this user got an
    // enabled button and collected a 403 with no explanation of what to do next.
    await expect(close).toHaveAttribute('title', 'Only the assigned reviewer can close this event.')

    // The server enforces it independently — a direct API caller is not stopped
    // by a disabled button at all, which is the only reason the button's state
    // is a usability fix rather than a security one.
    const res = await page.request.post(`/api/v1/services/qualityEvents/${FOREIGN_EV.id}/close`, {
      data: { method: 'PIN', token: ESIGN_PIN, provider: null, comments: null },
    })
    expect(res.status(), 'the reviewer rule is enforced server-side').toBe(403)
    const body = await res.json().catch(() => null)
    expect(body?.error?.message ?? '').toMatch(/assigned reviewer/i)

    expect(statusOf(FOREIGN_EV.id)).toBe('OPEN')
    expect(signatureRowsFor(FOREIGN_EV.id), 'a refused close signs nothing').toEqual([])
  })
})
