// QE-J4 — QE-H3: the two lifecycle edges that had NO server-side writer.
//
// THE FINDING. Until 2026-08-31 the Quality Events lifecycle guard could not
// take the shape its six peers take ("app_user may never change status_id"),
// because two of the module's four states were reachable ONLY from the detail
// header's status dropdown:
//
//   • CANCELLED had no endpoint at all. Ending a reported quality event —
//     asserting it will NOT be investigated — was a dropdown pick under plain
//     `quality_events:update`: no narrower permission, no signature, no reason,
//     and no audit row beyond the field-change the trigger happened to record.
//     "Why was this dropped?" is the only question an auditor asks about a
//     cancelled record, and the answer was nowhere.
//   • DRAFT had no exit. Nothing creates a DRAFT event — `createQualityEvent`
//     writes OPEN — but pre-existing rows and the retired dropdown both left
//     them behind, and blocking the dropdown would have stranded them for good.
//
// So the guard stayed permissive, and the client model could not lock `statusId`.
// This change ships both writers —
//
//     POST /v1/services/qualityEvents/:id/cancel   e-signed, `reason` REQUIRED,
//                                                  gated on :update + :close
//     POST /v1/services/qualityEvents/:id/submit   unsigned, DRAFT -> OPEN
//
// — which is what let migration 20260831122000 refuse untrusted status writes
// outright. QE-J2 asserts the refusal; this file asserts that the sanctioned
// paths it replaced them with actually work, because a guard that strands a
// state is a functional regression dressed as a security fix.
//
// Cancel is signed for the same reason CR cancel is, and its reason is mandatory
// for the same reason: the signature says who ended the record, the reason says
// why, and neither substitutes for the other.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, QUALITY_EVENTS, ESIGN_PIN } from '../fixtures/cast.js'
import {
  openEvent,
  actionBarButton,
  openCancelDialog,
  cancelReasonField,
  cancelViaUi,
  statusOf,
  statusLabel,
  waitForStatus,
  signatureRowsFor,
  auditRowsFor,
  attemptStatusWriteAs,
  resetLifecycleEvents,
} from '../fixtures/qualityEvents.js'

// EV-E2E-0003 — OPEN, assigned to qeManager, review fields deliberately EMPTY.
// Cancel must not require the review a close does: it asserts the event will not
// be investigated at all. If cancel ever starts demanding them, this fixture is
// what fails.
const CANCEL_EV = QUALITY_EVENTS.cancel
// EV-E2E-0004 — the only DRAFT in the tenant, and unreachable by any client
// path: the server creates events as OPEN, the client model defaults to OPEN and
// excludes statusId from its update mutation, and the guard refuses untrusted
// status writes. Seeding it is what keeps POST /submit testable at all.
const DRAFT_EV = QUALITY_EVENTS.draft
// An OPEN event, for the "Submit is not offered" half.
const OPEN_EV = QUALITY_EVENTS.close

const REVIEWER = USERS.qeManager
const REASON = 'E2E cancel — duplicate of EV-E2E-0002, filed twice by the same operator.'

test.describe('QE-J4 — cancel and submit (QE-H3)', () => {
  test.use({ storageState: AUTH.qeManager })

  // Cancel is TERMINAL and submit consumes the only DRAFT, so neither test can
  // run twice without a reset — and the guard now refuses the way back on the
  // trusted path too, which is why `resetLifecycleEvents` has to drop the
  // trigger rather than just run an UPDATE. In `beforeEach`, not only
  // `afterAll`: a crash mid-journey never reaches its own cleanup.
  test.beforeEach(() => resetLifecycleEvents())
  test.afterAll(() => resetLifecycleEvents())

  test('the reason dialog will not let an unexplained cancel through', async ({ page }) => {
    test.setTimeout(120_000)
    await openEvent(page, CANCEL_EV.id)
    await openCancelDialog(page)

    const signAndCancel = page.getByRole('button', { name: 'Sign & Cancel' })
    await expect(signAndCancel, 'an empty reason cannot be submitted').toBeDisabled()

    // Whitespace is not a reason. Asserted separately because `!reason.trim()`
    // and `!reason` are one character apart and only one of them is right. The
    // server agrees (`z.string().trim().min(1)` plus the controller guard), so
    // this is the UI half of a rule enforced at both ends — the endpoint half is
    // its own test below, because a disabled button proves nothing about the API.
    await cancelReasonField(page).fill('   ')
    await expect(signAndCancel, 'whitespace is not a reason').toBeDisabled()

    // The e-sign prompt is never reached, so nothing was signed and there was
    // nothing to sign for.
    await expect(page.getByPlaceholder('Enter your e-signature PIN')).toBeHidden()

    await cancelReasonField(page).fill(REASON)
    await expect(signAndCancel, 'a real reason unlocks the signature step').toBeEnabled()

    // Back out — this test is about the gate, not the cancel.
    await page.getByRole('button', { name: 'Back' }).click()
    expect(statusOf(CANCEL_EV.id)).toBe('OPEN')
    expect(signatureRowsFor(CANCEL_EV.id)).toEqual([])
  })

  // ── The barrier is the ENDPOINT, not the disabled button ────────────────
  //
  // Found by this suite on 2026-08-31 and FIXED the same day. POST /cancel used
  // to accept a whitespace-only reason: 200, event cancelled, and an
  // `audit_logs` row whose `reason` was the empty string — the exact state the
  // mandatory reason exists to prevent, because a cancelled record that looks
  // answered is worse than one that is visibly unanswered.
  //
  // One-line divergence from the peer it was modelled on.
  // `cancelQualityEventSchema` was `z.string().min(1)`, and '   ' is three
  // characters, so Zod was satisfied; the controller then stored `reason.trim()`.
  // Change Requests catches it in the controller (`changeRequests.js:366`).
  // Quality Events now does BOTH: `.trim().min(1)` in the schema so the length
  // check measures what is actually stored, and the peer's controller guard
  // behind it.
  //
  // Kept as a live gate rather than deleted with the fix — the disabled button
  // asserted above is usability, and a UI-only test would pass just as happily
  // against the broken endpoint.
  test('the server refuses a whitespace-only cancel reason', async ({ page }) => {
    test.setTimeout(120_000)
    expect(statusOf(CANCEL_EV.id)).toBe('OPEN')

    const res = await page.request.post(`/api/v1/services/qualityEvents/${CANCEL_EV.id}/cancel`, {
      data: { method: 'PIN', token: ESIGN_PIN, provider: null, reason: '   ' },
    })
    expect(res.status(), 'a reason-less cancel must be a 400').toBe(400)
    expect(statusOf(CANCEL_EV.id), 'a rejected cancel must not half-apply').toBe('OPEN')
    expect(signatureRowsFor(CANCEL_EV.id), 'and must not have signed anything').toEqual([])
  })

  test('a reasoned, signed cancel moves the event and records both halves', async ({ page }) => {
    test.setTimeout(120_000)
    expect(signatureRowsFor(CANCEL_EV.id), 'no signature before the cancel').toEqual([])
    // `audit_logs` is append-only — `prevent_audit_log_mutation()` refuses DELETE
    // for the superuser too — so the reset cannot clear CANCEL rows and this
    // assertion has to be a delta, not a count. See `auditRowsFor`.
    const cancelRowsBefore = auditRowsFor(CANCEL_EV.id, 'CANCEL').length

    await openEvent(page, CANCEL_EV.id)
    // The review fields are empty and that is correct — cancel does not require
    // the review a close does. If this button were disabled, the module would be
    // demanding an investigation before allowing an event to be dropped.
    await expect(actionBarButton(page, 'Cancel')).toBeEnabled({ timeout: 20_000 })

    await cancelViaUi(page, { reason: REASON })
    await waitForStatus(CANCEL_EV.id, 'CANCELLED')

    // ── The signature ────────────────────────────────────────────────────
    // Same ledger as close, different meaning — and, like close, this block
    // cannot RUN without migration 20260831120000: `signatureRowsFor` names
    // `signatures.quality_event_id`, so reverting it fails here with
    // `column does not exist` rather than with a soft assertion.
    const signatures = signatureRowsFor(CANCEL_EV.id)
    expect(signatures, 'exactly one Part-11 signature for this cancel').toHaveLength(1)
    expect(signatures[0].meaning).toBe('CANCELLED')
    expect(signatures[0].userId, 'attributed to the signer who typed the PIN').toBe(REVIEWER.id)
    expect(signatures[0].payloadHash, 'the signature manifest is hashed').toBeTruthy()
    // The controller passes the reason as the signature's comment, so the
    // attestation and the justification are one record, not two that have to be
    // correlated by timestamp.
    expect(signatures[0].comments).toContain('duplicate of EV-E2E-0002')

    // ── The audit row, and the reason inside it ──────────────────────────
    // THE finding's payload. A cancelled record with no recorded reason is the
    // state this endpoint exists to make impossible.
    const cancelRows = auditRowsFor(CANCEL_EV.id, 'CANCEL')
    expect(cancelRows.length, 'exactly one NEW CANCEL audit row').toBe(cancelRowsBefore + 1)
    const cancelRow = cancelRows.at(-1)
    expect(cancelRow.performedBy, 'attributed CANCEL').toBe(REVIEWER.id)
    expect(cancelRow.newValue.statusId).toBe('CANCELLED')
    expect(cancelRow.newValue.reason, 'the reason is in the audit trail').toBe(REASON)
    expect(cancelRow.newValue.signatureId, 'the audit row cites its signature').toBe(
      signatures[0].id,
    )

    await openEvent(page, CANCEL_EV.id)
    await expect(statusLabel(page, 'Cancelled')).toBeVisible({ timeout: 20_000 })
  })

  test('once CANCELLED the event is terminal, in the UI and in the database', async ({ page }) => {
    test.setTimeout(120_000)

    // Set up through the real endpoint rather than through the UI — this test is
    // about what happens AFTER the cancel, and driving the dialogs again would
    // only re-test the journey above.
    const setup = await page.request.post(`/api/v1/services/qualityEvents/${CANCEL_EV.id}/cancel`, {
      data: { method: 'PIN', token: ESIGN_PIN, provider: null, reason: 'E2E setup — terminal probe' },
    })
    expect(setup.ok(), 'setup cancel succeeded').toBeTruthy()
    expect(statusOf(CANCEL_EV.id)).toBe('CANCELLED')

    // The UI offers nothing that could move it. Every lifecycle descriptor in
    // qualityEventDetailConfig.js is gated on `isOpen`, so a terminal event's
    // action bar keeps only Print and Audit Log.
    await openEvent(page, CANCEL_EV.id)
    for (const label of ['Close', 'Cancel', 'Escalate', 'Submit']) {
      await expect(
        page.getByRole('button', { name: label, exact: true }),
        `${label} is not offered on a cancelled event`,
      ).toHaveCount(0)
    }

    // …and they are not merely pushed into the overflow menu, which is the other
    // way "the action bar has no Close button" could be true while Close is
    // still one click away. On a terminal event there is no overflow menu AT
    // ALL: `DetailActionBar` renders its first three visible actions inline and
    // only mounts the ⋯ trigger for a fourth, and a terminal event has exactly
    // two — Print and Audit Log. So the absence of that trigger is itself the
    // proof that nothing is hidden, and the two survivors are the positive
    // control that the bar rendered at all.
    await expect(actionBarButton(page, 'Print'), 'Print survives — the bar rendered').toBeVisible()
    await expect(actionBarButton(page, 'Audit Log'), 'Audit Log survives').toBeVisible()
    await expect(
      page.getByRole('button', { name: 'More actions' }),
      'with only two actions left there is nothing to overflow, so nothing can hide there',
    ).toHaveCount(0)

    // The database is the barrier, not the button. A raw mutation as `app_user`
    // — the role every GraphQL request runs under — is still refused.
    const reopen = attemptStatusWriteAs(REVIEWER, CANCEL_EV.id, 'OPEN')
    expect(reopen.sqlstate, 'a cancelled event cannot be reopened').toBe('QMSQE')
    expect(statusOf(CANCEL_EV.id)).toBe('CANCELLED')

    // And a second cancel through the front door is a clean 409, not a second
    // signature on an already-dead record.
    const again = await page.request.post(`/api/v1/services/qualityEvents/${CANCEL_EV.id}/cancel`, {
      data: { method: 'PIN', token: ESIGN_PIN, provider: null, reason: 'should be rejected' },
    })
    expect(again.status()).toBe(409)
    expect(signatureRowsFor(CANCEL_EV.id), 'the refused cancel signed nothing').toHaveLength(1)
  })

  test('Submit is the DRAFT exit, and it is unsigned by design', async ({ page }) => {
    test.setTimeout(120_000)
    expect(statusOf(DRAFT_EV.id)).toBe('DRAFT')
    const submitRowsBefore = auditRowsFor(DRAFT_EV.id, 'SUBMIT_FOR_REVIEW').length

    await openEvent(page, DRAFT_EV.id)
    const submit = actionBarButton(page, 'Submit')
    await expect(submit, 'a draft offers Submit').toBeVisible({ timeout: 20_000 })
    await expect(submit).toBeEnabled()

    await submit.click()
    await waitForStatus(DRAFT_EV.id, 'OPEN')

    // No signature, deliberately. Submitting an intake record is not a Part-11
    // assertion — it attests to nothing; it starts the work. Asserted rather
    // than assumed, because "sign everything" is the easy wrong answer and it
    // would put a PIN prompt in front of the one action that has no attestation
    // to make.
    expect(signatureRowsFor(DRAFT_EV.id), 'submit signs nothing').toEqual([])

    const submitRows = auditRowsFor(DRAFT_EV.id, 'SUBMIT_FOR_REVIEW')
    expect(submitRows.length, 'exactly one NEW SUBMIT_FOR_REVIEW audit row').toBe(
      submitRowsBefore + 1,
    )
    const submitRow = submitRows.at(-1)
    expect(submitRow.performedBy, 'attributed submit').toBe(REVIEWER.id)
    expect(submitRow.newValue.statusId).toBe('OPEN')

    // The button is gone from the now-open event: `visible` is `statusId ===
    // 'DRAFT'`, hidden rather than disabled, because "you cannot submit an event
    // that is already open" is not a permissions story with a fix.
    await openEvent(page, DRAFT_EV.id)
    await expect(statusLabel(page, 'Open')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Submit', exact: true })).toHaveCount(0)
  })

  test('an event that was never a draft never offers Submit', async ({ page }) => {
    test.setTimeout(120_000)
    // The complement of the test above, on an event that has been OPEN from the
    // start. Without it, "Submit disappeared" is equally consistent with "Submit
    // is only ever rendered once", which would leave a genuinely stranded DRAFT
    // undetectable.
    expect(statusOf(OPEN_EV.id)).toBe('OPEN')
    await openEvent(page, OPEN_EV.id)

    // Positive control first: this persona's other lifecycle actions DO render,
    // so an absent Submit is a decision rather than an unrendered action bar.
    await expect(actionBarButton(page, 'Close')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Submit', exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'More actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'Audit Log' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('menuitem', { name: 'Submit', exact: true })).toHaveCount(0)
  })
})
