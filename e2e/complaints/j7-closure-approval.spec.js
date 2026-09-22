// CMP-J7 — Customer Complaint CLOSURE, both arms of OQ-17 TC-17-05, plus the
// shared reopen steps 8/9.
//
// WHY THIS FILE EXISTS. J3 proves the happy support path (create → accept →
// assign → close) and stops at "close writes CLOSED". TC-17-05 is the part
// that actually carries regulatory weight and had no coverage anywhere: the
// closure-approval FORK, the e-signature on the approval, and — the half that
// is most often mis-recorded during execution — the precise LIMIT of what a
// closed complaint seals.
//
// THE PROTOCOL IS UNUSUALLY HONEST AND THIS FILE MATCHES IT, NOT A WISH.
// TC-17-05 5a step 3 says "editing is prevented IN THE INTERFACE" and then
// spends a whole note warning the executor not to read that as immutability.
// Both halves are asserted here on purpose:
//
//   · The STATUS of a CLOSED complaint cannot move anywhere but OPEN. That is
//     a real DB seal — `enforce_customer_complaint_status_transition()`
//     (BEFORE INSERT OR UPDATE OF status_id, ERRCODE QMSCM) refuses
//     `CLOSED -> <anything but OPEN>` even on the TRUSTED path, and refuses
//     ANY status write at all from `app_user`.
//   · The DESCRIPTIVE fields of a CLOSED complaint are NOT sealed. The
//     `customer_complaints_upd` RLS policy (read off the live catalog) carries
//     no status condition whatsoever, and `customer_complaints` has no REST
//     update route at all — every mutation is an ACTION endpoint — so an
//     update-holder edits through the SyncEngine/`app_user` path and a closed
//     row accepts it. Asserting a seal that does not exist would be a test
//     that passes today and quietly breaks the day someone adds one; asserting
//     the DOCUMENTED reality is what the protocol's own deviation note asks
//     for.
//
// ROUTES AND FIELD NAMES, ALL VERIFIED AGAINST THE BACKEND.
//   POST /v1/services/customerComplaints/:id/close
//        enforcePermission('complaint_management','update') (always on) +
//        a dormant requirePermission(...,'close'). The controller branches on
//        `companies.settings.complaintSettings.requireClosureApproval`:
//        ON  → transition to PENDING_APPROVAL (NOT closed)
//        OFF → transition to CLOSED + closedAt
//   POST /v1/services/customerComplaints/:id/approveClosure
//        NO route-level enforcePermission. The controller calls
//        assertCanActOnRecord(module 'complaint_management', action 'approve')
//        then verifyUserIdentity({strategy:'pin', token}). Body is
//        `{ token, comment? }` — `token` CARRIES THE PIN, not a session token.
//   POST /v1/services/customerComplaints/:id/reopen
//        CLOSED|RESOLVED → OPEN, and deliberately NULLs assignedTo.
//
// THE SETTING IS NOT A COLUMN. `requireClosureApproval` lives inside the
// `complaintSettings` object on the `companies.settings` JSONB blob.
// getComplaintSettings() re-reads the company row per request with no cache,
// so flipping it in SQL takes effect on the very next call — which is what
// makes both arms testable in one file. E2ELAB ships with NO complaintSettings
// key at all, so the afterAll REMOVES the key rather than writing `false`.
//
// ON CC-H2 (the "broken e-sign" note in the project memory): STALE, verified
// against the current controller. approveClosure no longer writes the
// decouple-dropped `closureApprovalRequired` / `closureApprovedBy` /
// `closureApprovedAt` columns — those writes were removed and the controller
// now records the approval as an AuditLog row instead. The PIN check is real
// (verifyUserIdentity, strategy 'pin', argon2 against users.esign_pin_hash,
// behind the 5-attempt esignPinGuard lockout). What REMAINS true, and is the
// genuine Part-11 limitation, is that no `signatures` ledger row is written —
// structurally impossible, `signatures` has no customer-complaint subject
// column. The protocol already states that as the EXPECTED observation, so
// this file asserts the empty register deliberately instead of pretending.
//
// PERSONAS. supportAgent holds complaint_management create/read/update at
// tenant scope and NOTHING else — no `approve`, and (checked in e2e-seed.sql
// §45) no e-sign PIN either, which is what makes them the honest
// without-permission arm for 5b step 3. owner (Olivia) is `users.is_owner`,
// which bypasses both enforcePermission and canActOnRecord, and is the only
// seeded persona with a PIN who can reach `approve` — so she is the Approver.
import { test, expect } from '@playwright/test'
import { AUTH, ESIGN_PIN, USERS } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  complaintAuditTrail,
  complaintSettings,
  createPersonaPool,
  customerComplaintStatusAsAppUser,
  customerComplaintStatusTrusted,
  editCustomerComplaintDescriptionAsAppUser,
  errorMessage,
  findCustomerComplaintBySubject,
  purgeCustomerComplaintBySubject,
  restoreComplaintSettings,
  restPost,
  setRequireClosureApproval,
  signatureRegisterRowsFor,
} from '../fixtures/complaints.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

// One complaint per arm — 5a and 5b both end CLOSED, and reusing a row across
// them would mean the second arm's `close` starts from a terminal status.
const SUBJECT_OFF = 'E2E J7 Closure Approval OFF'
const SUBJECT_ON = 'E2E J7 Closure Approval ON'

/** Mint one customer complaint as supportAgent and return its DB row. */
async function mintComplaint(page, subject) {
  const res = await restPost(page, '/customerComplaints', {
    subject,
    description: 'Seeded by CMP-J7 (OQ-17 TC-17-05).',
    customerName: 'Erin E2E Customer',
    customerEmail: 'erin.customer.j7@e2e.test',
  })
  expect(res.status(), `create failed: ${await res.text()}`).toBe(201)
  const row = findCustomerComplaintBySubject(subject)
  expect(row, `the ${subject} row landed in customer_complaints`).not.toBeNull()
  return row
}

test.describe('CMP-J7 · Customer Complaint closure + closure approval (OQ-17 TC-17-05)', () => {
  // The tenant's complaintSettings as this suite found them, restored verbatim
  // in afterAll. Snapshotting the OBJECT (not just the one flag) because
  // setRequireClosureApproval merges into it, and another suite may legitimately
  // own a sibling key like resolutionDays.
  let settingsSnapshot = null

  test.beforeAll(() => {
    settingsSnapshot = complaintSettings()
    purgeCustomerComplaintBySubject(SUBJECT_OFF)
    purgeCustomerComplaintBySubject(SUBJECT_ON)
    // Explicitly OFF rather than relying on the absent-key default: the 5a arm
    // must prove the direct-to-CLOSED branch, and a leftover `true` from a
    // crashed previous run would silently turn every 5a assertion inside out.
    setRequireClosureApproval(false)
  })

  test.afterAll(() => {
    purgeCustomerComplaintBySubject(SUBJECT_OFF)
    purgeCustomerComplaintBySubject(SUBJECT_ON)
    restoreComplaintSettings(settingsSnapshot)
  })

  // ── 5a — closure approval OFF ─────────────────────────────────────────────

  test('5a·1-2: with approval OFF, close writes straight to CLOSED and a second close is refused', async ({
    browser,
  }) => {
    // OQ-17 TC-17-05 5a step 1 (close → status becomes closed) and step 2
    // (a second close is refused).
    const page = await pool.page(browser, AUTH.supportAgent)
    const row = await mintComplaint(page, SUBJECT_OFF)

    const res = await restPost(page, `/customerComplaints/${row.id}/close`, {
      comment: 'CMP-J7 5a — closing with approval off.',
    })
    expect(res.status(), `close failed: ${await res.text()}`).toBe(200)

    const after = findCustomerComplaintBySubject(SUBJECT_OFF)
    expect(
      after.statusId,
      'approval OFF takes the direct branch — CLOSED, never PENDING_APPROVAL',
    ).toBe('CLOSED')
    expect(
      sqlValue(`SELECT closed_at IS NOT NULL FROM customer_complaints WHERE id = '${row.id}'`),
      'close stamped closed_at, so the closure carries a timestamp',
    ).toBe('t')

    // Step 2 — terminal. assertMutable() refuses any action on a
    // CC_TERMINAL_STATUSES row (CLOSED / CONVERTED_TO_NC) with a 409, rather
    // than silently re-closing and stamping a second closed_at.
    const again = await restPost(page, `/customerComplaints/${row.id}/close`, {})
    expect(again.status(), 'closing an already-closed complaint is refused').toBe(409)
    expect(await errorMessage(again)).toMatch(/CLOSED and cannot be modified/i)
  })

  test('5a·3: a closed complaint cannot change STATUS at the database — on either the untrusted or the trusted path', async ({
    browser,
  }) => {
    // OQ-17 TC-17-05 5a step 3, the half that IS a real seal. The protocol's
    // step text only claims an interface control; this asserts what the
    // database actually holds, which is the stronger and more durable claim.
    await pool.page(browser, AUTH.supportAgent) // keeps the pool warm for the next test
    const row = findCustomerComplaintBySubject(SUBJECT_OFF)
    expect(row?.statusId, 'the 5a·1 test left a CLOSED row behind').toBe('CLOSED')

    // Untrusted (SyncEngine / raw GraphQL as `app_user`): the QMSCM guard
    // refuses EVERY status write, legal edge or not — so even CLOSED -> OPEN,
    // which the trusted path allows, is refused here.
    const untrusted = customerComplaintStatusAsAppUser(USERS.supportAgent.id, row.id, 'IN_PROGRESS')
    expect(untrusted.ok, 'app_user cannot move a complaint out of CLOSED').toBe(false)
    expect(
      untrusted.error,
      'refused by the QMSCM status guard, not by RLS filtering the row away',
    ).toMatch(/status cannot be changed directly/i)

    // Trusted (what a REST controller / the worker runs as): CLOSED has
    // exactly one outgoing edge, and it is OPEN. Anything else is refused.
    const trusted = customerComplaintStatusTrusted(row.id, 'IN_PROGRESS')
    expect(trusted.ok, 'even the trusted path cannot move CLOSED -> IN_PROGRESS').toBe(false)
    expect(trusted.error).toMatch(/CLOSED -> IN_PROGRESS \(only reopen to OPEN is allowed\)/i)
  })

  test("5a·3 (documented gap): a closed complaint's DESCRIPTIVE fields are still editable by an update-holder", async ({
    browser,
  }) => {
    // OQ-17 TC-17-05 5a step 3's note, asserted as the true current behaviour.
    //
    // THIS IS NOT A TEST OF A BUG BEING CORRECT — it is a tripwire on a
    // documented, accepted gap. The protocol tells the executor in so many
    // words: "Do not conclude that the record is sealed. A user holding update
    // permission is not refused a direct API edit of a closed complaint's
    // descriptive fields." If someone later adds a status condition to
    // `customer_complaints_upd` or a BEFORE-UPDATE field guard, THIS test goes
    // red and the protocol note (and its deviation) must be retired with it.
    // That red is the signal, not a failure.
    //
    // The probe goes through `app_user` because that is the only write path
    // that exists for descriptive fields: `customer_complaints` has no REST
    // update route — accept / assign / reply / resolve / close / reopen are all
    // the REST surface offers — so the SyncEngine is how an agent edits.
    await pool.page(browser, AUTH.supportAgent)
    const row = findCustomerComplaintBySubject(SUBJECT_OFF)
    expect(row?.statusId, 'still CLOSED going into this probe').toBe('CLOSED')

    const edited = 'CMP-J7 — edited AFTER closure (documented gap, TC-17-05 5a note).'
    const res = editCustomerComplaintDescriptionAsAppUser(USERS.supportAgent.id, row.id, edited)
    expect(
      res.ok,
      'the `customer_complaints_upd` policy carries no status condition, so a tenant-scope ' +
        'update-holder still reaches a CLOSED row — this is the gap the protocol documents',
    ).toBe(true)
    expect(
      sqlValue(`SELECT description FROM customer_complaints WHERE id = '${row.id}'`),
      'the edit actually landed — the row is genuinely not immutable',
    ).toBe(edited)
    expect(
      findCustomerComplaintBySubject(SUBJECT_OFF).statusId,
      'and the status was untouched by it — only descriptive fields moved',
    ).toBe('CLOSED')
  })

  // ── 5b — closure approval ON ──────────────────────────────────────────────

  test('5b·1-2: with approval ON, close moves the complaint to PENDING_APPROVAL, not CLOSED', async ({
    browser,
  }) => {
    // OQ-17 TC-17-05 5b step 1 (submit for closure → awaiting approval, NOT
    // closed) and step 2 (it is listed as pending approval — asserted as the
    // PENDING_APPROVAL state the pending-approval list is built from; the
    // protocol's own note says no task and no notification is raised, so there
    // is nothing else to wait for).
    const page = await pool.page(browser, AUTH.supportAgent)
    setRequireClosureApproval(true)
    const row = await mintComplaint(page, SUBJECT_ON)

    const res = await restPost(page, `/customerComplaints/${row.id}/close`, {
      comment: 'CMP-J7 5b — submitting for closure approval.',
    })
    expect(res.status(), `close failed: ${await res.text()}`).toBe(200)

    const after = findCustomerComplaintBySubject(SUBJECT_ON)
    expect(
      after.statusId,
      'the SAME endpoint forks on the company setting — approval ON means PENDING_APPROVAL',
    ).toBe('PENDING_APPROVAL')
    expect(
      sqlValue(`SELECT closed_at IS NULL FROM customer_complaints WHERE id = '${row.id}'`),
      'nothing was closed, so closed_at must still be null',
    ).toBe('t')
    // PENDING_APPROVAL is a real seeded lookup row, not a string the controller
    // invents — an unseeded status id would have failed the FK instead.
    expect(
      sqlValue(`SELECT count(*) FROM customer_complaint_statuses WHERE id = 'PENDING_APPROVAL'`),
      'PENDING_APPROVAL is seeded, so the pending-approval list has a status to filter on',
    ).toBe('1')
  })

  test('5b·3: a user WITHOUT complaint_management:approve is refused the closure approval', async ({
    browser,
  }) => {
    // OQ-17 TC-17-05 5b step 3. supportAgent holds create/read/update at
    // tenant scope and nothing else — the seed's trailing DELETE guarantees no
    // stray `approve`. Note the protocol's own note here: approval is gated on
    // the PERMISSION, not on named ownership (the owner column was dropped), so
    // this arm is the only thing standing between "restricted approval" and
    // "anyone with update".
    const page = await pool.page(browser, AUTH.supportAgent)
    const row = findCustomerComplaintBySubject(SUBJECT_ON)
    expect(row?.statusId, 'the 5b·1 test left a PENDING_APPROVAL row behind').toBe(
      'PENDING_APPROVAL',
    )

    const res = await restPost(page, `/customerComplaints/${row.id}/approveClosure`, {
      token: ESIGN_PIN,
    })
    expect(
      res.status(),
      'assertCanActOnRecord refuses the approve action for a role that lacks it',
    ).toBe(403)
    expect(await errorMessage(res)).toMatch(/permission to approve closure of this complaint/i)
    expect(
      findCustomerComplaintBySubject(SUBJECT_ON).statusId,
      'and the refusal left the complaint where it was',
    ).toBe('PENDING_APPROVAL')
  })

  test('5b·4: the approver with a WRONG signing credential is refused and the complaint stays open', async ({
    browser,
  }) => {
    // OQ-17 TC-17-05 5b step 4. The PIN is carried in `token` (approveClosureSchema:
    // `{ method?: 'PIN', token: string, comment?: string }`) and checked by
    // verifyUserIdentity({strategy:'pin'}) with argon2 against
    // users.esign_pin_hash. A bad PIN raises BadRequestError → 400 (NOT 403:
    // the caller IS permitted, the CREDENTIAL is what failed — worth pinning,
    // because collapsing the two would hide a permission regression behind a
    // credential message).
    //
    // Exactly ONE wrong attempt on purpose: esignPinGuard locks the signer out
    // for 15 minutes after 5 failures, and a loop here would lock `owner` out
    // of every e-signing suite that runs after this one.
    const page = await pool.page(browser, AUTH.owner)
    const row = findCustomerComplaintBySubject(SUBJECT_ON)

    const res = await restPost(page, `/customerComplaints/${row.id}/approveClosure`, {
      method: 'PIN',
      token: '00000000',
      comment: 'CMP-J7 5b — deliberately wrong PIN.',
    })
    expect(res.status(), 'a wrong PIN is a credential failure, not an authorization one').toBe(400)
    expect(await errorMessage(res)).toMatch(/invalid pin/i)

    const after = findCustomerComplaintBySubject(SUBJECT_ON)
    expect(after.statusId, 'the approval did not go through — still awaiting approval').toBe(
      'PENDING_APPROVAL',
    )
    expect(
      sqlValue(`SELECT closed_at IS NULL FROM customer_complaints WHERE id = '${row.id}'`),
      'and nothing was closed behind the failed signature',
    ).toBe('t')
  })

  test("5b·5-6: the correct credential closes it, and the signature evidence lands in the COMPLAINT'S AUDIT TRAIL", async ({
    browser,
  }) => {
    // OQ-17 TC-17-05 5b step 5 (correct credential → closed, identity verified
    // by PIN) and step 6 (the audit-trail entry carries signer, date/time and
    // method).
    const page = await pool.page(browser, AUTH.owner)
    const row = findCustomerComplaintBySubject(SUBJECT_ON)

    const res = await restPost(page, `/customerComplaints/${row.id}/approveClosure`, {
      method: 'PIN',
      token: ESIGN_PIN,
      comment: 'CMP-J7 5b — approved for closure.',
    })
    expect(res.status(), `approveClosure failed: ${await res.text()}`).toBe(200)

    const after = findCustomerComplaintBySubject(SUBJECT_ON)
    expect(after.statusId, 'the approval is what closes the complaint').toBe('CLOSED')
    expect(
      sqlValue(`SELECT closed_at IS NOT NULL FROM customer_complaints WHERE id = '${row.id}'`),
      'closed_at stamped by the approval, not by the earlier submit',
    ).toBe('t')

    // Step 6 — the audit trail IS the signature evidence for this module.
    // approveClosure writes the AuditLog row inside the same transaction as
    // the status change, so a 200 means the row is already there (no worker,
    // no barrier needed).
    const trail = complaintAuditTrail(row.id)
    const closure = trail.find((e) => e.action === 'CLOSE')
    expect(closure, 'the approval left a CLOSE entry in the complaint audit trail').toBeTruthy()
    expect(closure.performedBy, 'the SIGNER is recorded — the approver, not the submitter').toBe(
      USERS.owner.id,
    )
    // Matched on the VALUE, not on a serialized substring: `new_value_json` is
    // jsonb, and Postgres renders it with a space after the colon
    // (`"esignMethod": "PIN"`). A `toContain('"esignMethod":"PIN"')` therefore
    // fails against a row that is entirely correct — which is exactly what it
    // did on this suite's first real run.
    expect(
      JSON.parse(closure.newValueJson).esignMethod,
      'the METHOD is recorded on the entry',
    ).toBe('PIN')
    expect(
      sqlValue(
        `SELECT count(*) FROM audit_logs WHERE entity_type = 'CustomerComplaint'
           AND entity_id = '${row.id}' AND action = 'CLOSE' AND performed_at IS NOT NULL`,
      ),
      'and the DATE/TIME is recorded — performed_at is NOT NULL on the entry',
    ).toBe('1')
  })

  test('5b·5-6 (expected, not a failure): the system-wide signature register holds NO row for a customer complaint', async ({
    browser,
  }) => {
    // OQ-17 TC-17-05 5b steps 5–6, the note. This is the genuine Part-11 limit
    // of this module and the protocol states it as the EXPECTED observation:
    // "an empty signature register is the expected observation, not a failure."
    //
    // It is structural, not an oversight in the controller. `signatures` carries
    // exactly one subject FK per regulated record type — capa_id, nc_id,
    // change_request_id, quality_event_id, record_id, task_instance_id,
    // retain_sample_id, sampling_plan_id, specification_id,
    // field_record_revision_id, workflow_instance_step_id,
    // assignment_instance_id, equipment_id — constrained by
    // `signatures_subject_exactly_one_chk`, and NONE of them names a customer
    // complaint. There is no column to write the row against, so
    // approveClosure calls verifyUserIdentity() directly instead of
    // signatureService.verifyAndSign() like its CAPA/NC/CR siblings do.
    //
    // Asserting the zero deliberately (rather than just not looking) means the
    // day a migration DOES add `customer_complaint_id` and wires up
    // verifyAndSign, this test goes red and tells us the protocol note can be
    // retired. Silence would tell us nothing either way.
    await pool.page(browser, AUTH.owner)
    const row = findCustomerComplaintBySubject(SUBJECT_ON)
    expect(row?.statusId, 'the approval arm left a CLOSED row behind').toBe('CLOSED')

    expect(
      signatureRegisterRowsFor(row.id),
      'no `signatures` ledger row — expected: the table has no customer-complaint subject column',
    ).toBe(0)
    expect(
      sqlValue(
        `SELECT count(*) FROM information_schema.columns
          WHERE table_name = 'signatures' AND column_name = 'customer_complaint_id'`,
      ),
      'and the reason is the schema itself, not a missed call in the controller',
    ).toBe('0')
  })

  // ── Steps 8 & 9 — reopen (both paths) ─────────────────────────────────────

  test('8: reopen returns a CLOSED complaint to OPEN and DELIBERATELY clears the assignee', async ({
    browser,
  }) => {
    // The 5b arm above turned `requireClosureApproval` ON, and these tests run
    // serially against one tenant-wide setting, so it is still on here. Steps 8
    // and 9 close a ticket as part of their own arrangement; with the setting
    // on, that close lands on PENDING_APPROVAL and the follow-up reopen is
    // refused 409 ("Only resolved or closed complaints can be reopened").
    // That is a fixture leak between tests, not a product fault — it is what
    // these two tests failed on during the suite's first real run.
    //
    // Turned off HERE rather than in a describe-level beforeEach: this is a
    // flat describe, so a hook would also fire before the 5b tests and switch
    // off the very setting they exist to exercise.
    setRequireClosureApproval(false)
    // OQ-17 TC-17-05 step 8. The unassignment is DESIGNED, not a defect — the
    // protocol says so, and the controller comment says why: "unassigned" is
    // defined module-wide as !assignedTo (it gates the Accept button and drives
    // the unassigned filter/stat), so leaving the prior assignee in place would
    // make a freshly reopened, genuinely unclaimed complaint look accepted.
    //
    // Assigning FIRST is what makes the clearing observable: reopening an
    // already-unassigned complaint would assert nothing.
    const agentPage = await pool.page(browser, AUTH.supportAgent)
    const row = findCustomerComplaintBySubject(SUBJECT_OFF)
    expect(row?.statusId, 'the 5a arm left a CLOSED row behind').toBe('CLOSED')

    // Reopen is the only legal move out of CLOSED, so it necessarily comes
    // first: a closed complaint refuses `assign` outright (assertMutable
    // rejects every action on a CC_TERMINAL_STATUSES row). Hence the two
    // rounds below — reopen, THEN assign/close/reopen again.
    //
    // `owner` drives the reopen: the reopen route carries
    // enforcePermission('complaint_management','update'), which supportAgent
    // also satisfies, but using the owner keeps the step-9 attribution
    // assertion able to tell the closer and the reopener apart.
    const ownerPage = await pool.page(browser, AUTH.owner)
    const reopened = await restPost(ownerPage, `/customerComplaints/${row.id}/reopen`, {
      comment: 'CMP-J7 step 8 — reopening.',
    })
    expect(reopened.status(), `reopen failed: ${await reopened.text()}`).toBe(200)

    let after = findCustomerComplaintBySubject(SUBJECT_OFF)
    expect(after.statusId, 'reopen from CLOSED lands on OPEN — the one legal outgoing edge').toBe(
      'OPEN',
    )
    expect(
      sqlValue(`SELECT closed_at IS NULL FROM customer_complaints WHERE id = '${row.id}'`),
      'reopen cleared closed_at, so the record no longer reads as closed',
    ).toBe('t')

    // Now assign, close and reopen again — this round proves the ASSIGNEE
    // clearing specifically, which the first reopen could not (the 5a row was
    // never assigned).
    const assign = await restPost(agentPage, `/customerComplaints/${row.id}/assign`, {
      userId: USERS.supportAgent.id,
    })
    expect(assign.status(), `assign failed: ${await assign.text()}`).toBe(200)
    expect(findCustomerComplaintBySubject(SUBJECT_OFF).assignedTo).toBe(USERS.supportAgent.id)

    const close = await restPost(agentPage, `/customerComplaints/${row.id}/close`, {})
    expect(close.status(), `re-close failed: ${await close.text()}`).toBe(200)

    const reopenAgain = await restPost(ownerPage, `/customerComplaints/${row.id}/reopen`, {})
    expect(reopenAgain.status(), `second reopen failed: ${await reopenAgain.text()}`).toBe(200)

    after = findCustomerComplaintBySubject(SUBJECT_OFF)
    expect(after.statusId).toBe('OPEN')
    expect(
      after.assignedTo,
      'the assignee is deliberately cleared — the complaint comes back UNASSIGNED and must be reassigned to be worked',
    ).toBeNull()
  })

  test('9: closure and reopening both appear in the complaint audit trail', async ({ browser }) => {
    // OQ-17 TC-17-05 step 9. Both entries are written by the controllers
    // (close → AUDIT_ACTIONS.CLOSE, reopen → AUDIT_ACTIONS.REOPEN) inside the
    // same transaction as their status change, so they are present the moment
    // the calls returned 200.
    await pool.page(browser, AUTH.owner)
    const row = findCustomerComplaintBySubject(SUBJECT_OFF)
    const trail = complaintAuditTrail(row.id)

    const actions = trail.map((e) => e.action)
    expect(actions, 'the closure is in the trail').toContain('CLOSE')
    expect(actions, 'the reopening is in the trail').toContain('REOPEN')

    // Step 8 ran close/reopen twice on this row, so both entries appear more
    // than once — asserted as ">= 2" rather than an exact count so a future
    // extra arm in this file does not have to renumber an assertion.
    expect(
      actions.filter((a) => a === 'CLOSE').length,
      'each closure left its own entry rather than overwriting the previous one',
    ).toBeGreaterThanOrEqual(2)
    expect(actions.filter((a) => a === 'REOPEN').length).toBeGreaterThanOrEqual(2)

    // Attribution, which TC-17-08 step 3 also depends on: every entry names who
    // did it. The reopens were the owner's; the closes were the agent's.
    // Only the LIFECYCLE actions are asserted to name a person, and the
    // distinction is real rather than a convenience.
    //
    // Two writers land rows on this entity. The CONTROLLERS write CLOSE /
    // REOPEN / ACCEPT / ASSIGN synchronously, with `performedBy` set from the
    // session — those must always name someone. The TRIGGER writes CREATE /
    // UPDATE / DELETE asynchronously, through graphile_worker, on a connection
    // that sets no `app.current_user_id`, so `performed_by` is legitimately
    // NULL (verified against app-db: every UPDATE and DELETE row on this
    // entity type has a NULL performer).
    //
    // The original blanket loop therefore asserted something the system does
    // not promise, and failed on a trigger-written UPDATE — a correct row.
    const ATTRIBUTED_ACTIONS = ['CLOSE', 'REOPEN', 'ACCEPT', 'ASSIGN']
    const attributed = trail.filter((e) => ATTRIBUTED_ACTIONS.includes(e.action))
    expect(attributed.length, 'there are lifecycle entries to attribute').toBeGreaterThan(0)
    for (const entry of attributed) {
      expect(entry.performedBy, `audit entry ${entry.action} carries a performer`).toBeTruthy()
    }
    const reopen = trail.find((e) => e.action === 'REOPEN')
    expect(reopen.performedBy, 'the reopen is attributed to the user who reopened it').toBe(
      USERS.owner.id,
    )
  })
})
