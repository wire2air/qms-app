// CMP-J2 — `enforce_complaint_status_transition` (QMSCM), both trust arms.
//
// WHY THIS FILE EXISTS. The module's own state-machine doc
// (docs/modules/complaints/07-state-machine.md) carries a superseded banner
// pointing at the unified vocabulary, but the body text BELOW that banner
// still shows the OLD NEW/IN_PROGRESS/RESOLVED/CONVERTED_TO_NC edge graph — a
// reader skimming past the banner would write a guard from the wrong graph.
// This file is verified against the LIVE trigger function
// (20260828180000-unify-complaint-statuses.js), not the doc body, following
// the "measure it against the trigger, not the doc" discipline
// records/r3-lifecycle-guard.spec.js used after finding its own doc wrong.
//
// Statuses: DRAFT / OPEN / CLOSED / CANCELLED — the unified vocabulary shared
// with NC/CAPA/CR/QE/Audits/Module Records. Live edges, read off the function
// body: DRAFT->OPEN, DRAFT->CANCELLED, OPEN->CLOSED, OPEN->CANCELLED,
// CLOSED->OPEN (the effectiveness/reopen edge — NOT in the doc body).
// CANCELLED is terminal. `app_user` (untrusted / SyncEngine / raw GraphQL)
// may INSERT only DRAFT or OPEN and may NEVER change status_id once a row
// exists — the client model (models/complaint.js) already blocks this by
// excluding statusId from the generated update mutation; this file proves
// the DATABASE also refuses it, which is what actually stands between a
// permitted holder and a bypassed close gate.
//
// EVERY PROBE IS TWO-SIDED. A TRIGGER refusal RAISES (`ok === false`, with
// the QMSCM message). A POLICY refusal SUCCEEDS against zero rows — nothing
// throws. A probe that only checked `ok` would read the second as a passing
// guard. `complaintOwner` holds `complaints:update` at TENANT scope, so
// `complaint_update_rls` admits them to every row in the tenant — a status
// write refused for them is therefore unambiguously the TRIGGER.
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  createPersonaPool,
  findComplaint,
  insertComplaintAsAppUser,
  insertComplaintTrusted,
  purgeComplaintBySubject,
  purgeComplaintsById,
  purgeMintedComplaints,
  restPost,
  statusWriteAsAppUser,
  statusWriteTrusted,
  touchAsAppUser,
} from '../fixtures/complaints.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const SUBJECT = 'E2E J2 Complaint Subject'

// Probe ids, one per test, so a failure never leaves another test's row behind.
const P = {
  untrusted: 'e2e5f900-0000-4000-8000-000000000001',
  trusted: 'e2e5f900-0000-4000-8000-000000000002',
  insertUntrusted: 'e2e5f900-0000-4000-8000-000000000003',
  draftArm: 'e2e5f900-0000-4000-8000-000000000004',
}

/** Mint a fresh OPEN complaint (the only state createComplaint ever produces)
 *  as complaintOwner, via the real create route — not a raw INSERT — so the
 *  probes run against a row the app itself considers well-formed. */
async function mintComplaint(page, subject = SUBJECT) {
  const res = await restPost(page, '/complaints', {
    subject,
    description: 'Seeded by CMP-J2.',
  })
  expect(res.status(), `arrange failed: ${await res.text()}`).toBe(201)
  const body = await res.json()
  return body.complaint.id
}

test.describe('CMP-J2 · the QMSCM lifecycle guard', () => {
  test.beforeAll(() => {
    purgeMintedComplaints()
    purgeComplaintBySubject(SUBJECT)
    purgeComplaintsById(Object.values(P))
  })
  test.afterAll(() => {
    purgeComplaintBySubject(SUBJECT)
    purgeComplaintsById(Object.values(P))
  })

  test('the probe itself is valid — SECURITY INVOKER, four statuses, live trigger', () => {
    // Same premise-check REC-J3 opens with: under SECURITY DEFINER,
    // `current_user` inside the function body is the function OWNER, not the
    // caller — every untrusted-path assertion below would become a silent
    // no-op. Quality Events shipped exactly that mistake and it sat inert for
    // 8 days (docs/modules/quality-events/23).
    expect(
      sqlValue(
        `SELECT prosecdef FROM pg_proc WHERE proname = 'enforce_complaint_status_transition'`,
      ),
      'enforce_complaint_status_transition is SECURITY INVOKER',
    ).toBe('f')

    const trigger = sqlValue(`
      SELECT pg_get_triggerdef(oid) FROM pg_trigger
       WHERE NOT tgisinternal AND tgrelid = 'public.complaints'::regclass
         AND pg_get_triggerdef(oid) ILIKE '%enforce_complaint_status_transition%'`)
    expect(trigger, 'the guard is actually attached to public.complaints').toBeTruthy()

    expect(
      sqlValue(`SELECT string_agg(id, ',' ORDER BY id) FROM complaint_statuses`),
      'complaint_statuses holds exactly the unified four',
    ).toBe('CANCELLED,CLOSED,DRAFT,OPEN')
  })

  test('app_user may never change status_id directly, however permitted', async ({ browser }) => {
    const page = await pool.page(browser, AUTH.complaintOwner)
    const id = await mintComplaint(page)
    expect(findComplaint(id).statusId, 'createComplaint always lands OPEN').toBe('OPEN')

    // The pair that makes the refusals mean something: complaintOwner holds
    // complaints:update at TENANT scope, so a non-status write on the SAME
    // row over the SAME app_user path must succeed — proving any refusal
    // below is the trigger, not complaint_update_rls filtering the row out.
    const touch = touchAsAppUser(USERS.complaintOwner.id, id)
    expect(touch.ok, 'the permitted holder can write this row at all').toBeTruthy()

    for (const target of ['DRAFT', 'CLOSED', 'CANCELLED']) {
      const res = statusWriteAsAppUser(USERS.complaintOwner.id, id, target)
      expect(res.ok, `app_user cannot set status to ${target} (OPEN->${target})`).toBeFalsy()
      expect(res.error, 'the refusal is the lifecycle guard, not a policy or a bare FK').toMatch(
        /Complaint status cannot be changed directly/,
      )
    }
    expect(findComplaint(id).statusId, 'the complaint never moved').toBe('OPEN')
  })

  test('INSERT admits only DRAFT or OPEN, on the untrusted path', () => {
    for (const status of ['CLOSED', 'CANCELLED']) {
      const res = insertComplaintAsAppUser(USERS.complaintOwner.id, P.insertUntrusted, status, {
        subject: 'CMP-J2 insert probe',
      })
      expect(res.ok, `a complaint cannot be inserted directly into ${status}`).toBeFalsy()
      expect(res.error).toMatch(/can only be created in DRAFT or OPEN/)
    }
    // The pair: OPEN via the same untrusted path DOES succeed — the refusals
    // above are about the status, not about app_user being unable to insert
    // a complaint at all (which would make every refusal vacuous).
    const ok = insertComplaintAsAppUser(USERS.complaintOwner.id, P.insertUntrusted, 'OPEN', {
      subject: 'CMP-J2 insert probe',
    })
    expect(ok.ok, 'app_user CAN insert a complaint in OPEN').toBeTruthy()
    expect(findComplaint(P.insertUntrusted)?.statusId).toBe('OPEN')
  })

  test('trusted path walks the real graph: OPEN -> CLOSED -> OPEN (reopen) -> CANCELLED', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.complaintOwner)
    const id = await mintComplaint(page, `${SUBJECT} 2`)

    for (const [from, to] of [
      ['OPEN', 'CLOSED'],
      // CLOSED -> OPEN is the effectiveness/reopen edge — pinned as LEGAL
      // rather than left implicit, the same way REC-J3 pins its own
      // equivalent: a guard written from 07-state-machine.md's stale body
      // text (which never mentions this edge for complaints) would have
      // broken every complaint reopen in production.
      ['CLOSED', 'OPEN'],
    ]) {
      expect(findComplaint(id).statusId, `precondition for ${from}->${to}`).toBe(from)
      const res = statusWriteTrusted(id, to)
      expect(res.ok, `${from} -> ${to} is legal for a trusted caller`).toBeTruthy()
      expect(findComplaint(id).statusId).toBe(to)
    }

    // From OPEN, CANCELLED is also legal (withdraw-before-investigation).
    const cancel = statusWriteTrusted(id, 'CANCELLED')
    expect(cancel.ok, 'OPEN -> CANCELLED is legal').toBeTruthy()
    expect(findComplaint(id).statusId).toBe('CANCELLED')

    // CANCELLED is terminal — no edge leads out of it, trusted or not.
    for (const target of ['OPEN', 'CLOSED', 'DRAFT']) {
      const res = statusWriteTrusted(id, target)
      expect(res.ok, `CANCELLED -> ${target} is refused — CANCELLED is terminal`).toBeFalsy()
      expect(res.error).toMatch(/CANCELLED is terminal|Illegal complaint status transition/)
    }
    expect(findComplaint(id).statusId, 'and the complaint stayed cancelled').toBe('CANCELLED')
    purgeComplaintBySubject(`${SUBJECT} 2`)
  })

  test('DRAFT -> OPEN and DRAFT -> CANCELLED are legal; DRAFT -> CLOSED is not', () => {
    // No app path ever creates a DRAFT complaint — createComplaint hardcodes
    // OPEN (DRAFT is reachable only as the column DEFAULT, never written by
    // any controller). This test arranges its own DRAFT row directly on the
    // trusted path, which the INSERT arm allows, to exercise the one live
    // edge nothing in the product currently walks.
    const arranged = insertComplaintTrusted(P.draftArm, 'DRAFT', {
      subject: 'CMP-J2 draft arm',
      ownerId: USERS.complaintOwner.id,
    })
    expect(arranged.ok, `arrange failed: ${arranged.error}`).toBeTruthy()
    expect(findComplaint(P.draftArm).statusId).toBe('DRAFT')

    const toClosed = statusWriteTrusted(P.draftArm, 'CLOSED')
    expect(toClosed.ok, 'DRAFT -> CLOSED is not a legal edge').toBeFalsy()
    expect(toClosed.error).toMatch(/Illegal complaint status transition/)
    expect(findComplaint(P.draftArm).statusId, 'the complaint stayed DRAFT').toBe('DRAFT')

    const toOpen = statusWriteTrusted(P.draftArm, 'OPEN')
    expect(toOpen.ok, 'DRAFT -> OPEN is legal').toBeTruthy()
    expect(findComplaint(P.draftArm).statusId).toBe('OPEN')

    // Re-arrange a second DRAFT row for the other outgoing edge — OPEN has no
    // legal edge back to DRAFT, so this cannot be tested by walking backward.
    purgeComplaintsById([P.draftArm])
    const arranged2 = insertComplaintTrusted(P.draftArm, 'DRAFT', {
      subject: 'CMP-J2 draft arm',
      ownerId: USERS.complaintOwner.id,
    })
    expect(arranged2.ok, `re-arrange failed: ${arranged2.error}`).toBeTruthy()
    const toCancelled = statusWriteTrusted(P.draftArm, 'CANCELLED')
    expect(toCancelled.ok, 'DRAFT -> CANCELLED is legal (cancel-before-submit)').toBeTruthy()
    expect(findComplaint(P.draftArm).statusId).toBe('CANCELLED')
  })

  test('UI: markComplete refuses to close a complaint with an open workflow step', async ({
    browser,
  }) => {
    // The record-level gate (assertCanActOnRecord + countOpenStepsForClose) is
    // enforced ABOVE the trigger — a distinct control worth pinning alongside
    // the trigger itself. createComplaint auto-starts the QA-review workflow,
    // so a freshly-minted complaint always has an open Investigation step.
    const page = await pool.page(browser, AUTH.complaintOwner)
    const id = await mintComplaint(page, `${SUBJECT} 3`)

    const res = await restPost(page, `/complaints/${id}/markComplete`, {})
    expect(res.status(), 'close is refused while a workflow step is open').toBe(409)
    const body = await res.text()
    expect(body).toMatch(/workflow step.*open|Complete, skip, or schedule/i)
    expect(findComplaint(id).statusId, 'the complaint stayed OPEN').toBe('OPEN')
    purgeComplaintBySubject(`${SUBJECT} 3`)
  })
})
