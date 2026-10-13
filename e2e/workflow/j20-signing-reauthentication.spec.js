// PW-J20 · URS-SEC-12 — "signing requires re-authentication with a credential
// distinct from the session". The three halves PW-J16 never reaches.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT PW-J16 ALREADY PROVES
//
// PW-J16 drives the per-module reject endpoint and proves that a WRONG PIN is
// refused atomically — nothing moves, nothing is signed. That is TC-16-10 steps
// 2 and 3. It never asks the three questions this file is about:
//
//   step 1  Is a prompt DEMANDED of an already-signed-in user? PW-J16 posts
//           credentials directly and never observes the browser, so "the
//           product asks" is assumed rather than measured.
//   step 5  Does the signing credential LOCK OUT after repeated failures?
//   step 1  …and the note under it: is there a route that mints a signature
//           with NO credential at all?
//
// The third is the one that matters under 21 CFR §11.200(a)(1), because it is
// the control that distinguishes an electronic SIGNATURE from an ordinary
// authenticated action. A product where every dialog prompts and one data
// route does not has not implemented the control — it has implemented a habit.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS VERIFIED IN CODE BEFORE ANY OF THIS WAS WRITTEN
//
// THE VERIFIER. `verifyEsignIdentity` (api/services/signatureService.js:576)
// accepts `PIN`, `PASSWORD` and `OAUTH`. Only the PIN branch calls
// `assertEsignPinNotLocked` / `recordEsignPinAttempt`.
//
// THE LOCKOUT (api/utils/esignPinGuard.js, exact values):
//   MAX_ATTEMPTS      5      (:76)
//   WINDOW_SECONDS    900    (:77)   rolling failure window
//   LOCK_SECONDS      900    (:78)   how long the lock holds
//   Redis key         `esign:pinfail:<userId>`  (:84)
//   Refusal           HTTP 429, `code: 'ESIGN_PIN_LOCKED'`  (:143/:147)
// Mirrored to `users.esign_pin_failed_count` / `users.esign_pin_locked_until`
// so the lock survives a Redis outage. Both halves are probed below — a lock
// that lived only in Redis would evaporate on a restart.
//
// ⚠ THE METHOD IS NOT AN ORG SETTING. There is no `esign_method` column on
// `companies` or `org_security_settings` — the method is whatever the CLIENT
// sends, and the shipped dialog only ever sends PIN
// (workflowInstanceEsignAuthDialog.vue:79). OQ-16 TC-16-10 step 7 asks the
// executor to "record which signing method is in use"; the honest answer is
// that an organisation cannot configure one, and cannot prevent a caller
// choosing PASSWORD — which has no lockout at all. That asymmetry is pinned
// in test 3 rather than left as prose.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 THE HEADLINE FINDING — SEC-12-D1, and it is a REAL Part 11 gap
//
//   POST /v1/services/signatures   (api/routes/signatures.js:153)
//     requireAuthByApiKey → requireCompanyAccess → express.json() → validate()
//     → createSignature
//
// No `enforcePermission`. No credential middleware. The controller
// (api/controllers/signatures.js:60) checks ONE thing — that the caller is the
// task's assignee (or the company owner) — and then calls
// `createSignatureRecord` DIRECTLY, bypassing `verifyAndSign` entirely. It
// imports the record writer, not either verifier.
//
// Worse than "unsigned": the `meaning` is CALLER-SUPPLIED, from
// `z.enum(['APPROVED','REJECTED','REVIEWED','VERIFIED'])`
// (api/schemas/signatures.js:3). Every other signing path in the product sets
// the meaning server-side from the action taken. Here an assigned reviewer
// posts `meaning: 'APPROVED'` on their own task, with their session cookie and
// nothing else, and a Part-11 signature row appears claiming they approved it.
//
// The repository's own authz-coverage test allowlists the route with the
// justification "reviewer-binding guard in controller"
// (api/tests/routeAuthzAllowlist.js:386) — i.e. it is known that the reviewer
// binding is the only gate. What is not recorded anywhere is that the binding
// is an AUTHORISATION check and §11.200(a)(1) asks for an AUTHENTICATION one.
//
// Test 2 drives this end to end and asserts the CURRENT behaviour — a 201 and a
// real `signatures` row — with the defect pinned. That is deliberate and it is
// the honest thing to write: softening it to "the route refuses" would be a
// test that fails against the product as shipped, and asserting something
// trivially true would manufacture a pass. When the route is fixed this test
// goes red, which is the signal to flip it.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ESIGN_PIN, USERS, COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { completeReviewerStep, stepIdByName } from '../fixtures/changeRequests.js'
import { createLiveWorkflowInstance } from '../fixtures/workflow.js'
import {
  clearEsignPinLockout,
  errorBody,
  signatureCountForInstance,
  signaturesForTask,
  stepStatus,
  taskStatus,
  waitForAssignedTask,
} from '../fixtures/workflowGuards.js'

test.use({ storageState: AUTH.author })

/** The PIN guard's configured values, read off the product rather than guessed. */
const MAX_ATTEMPTS = 5

/**
 * Drive a CR to its e-sign APPROVAL step. Same helper shape PW-J16 uses, and
 * the same premise check: step 2 of the seeded CR workflow is the only step in
 * the E2E tenant that is both APPROVAL and `require_esignature = true`, so it
 * is the only place this question can be asked at all.
 */
async function reachApprovalStep(page, browser, tag) {
  const { crId, instanceId } = await createLiveWorkflowInstance(page, tag)
  await completeReviewerStep(browser, crId)

  const stepId = stepIdByName(crId, 'Change Approval')
  expect(stepId, 'the CR workflow has a "Change Approval" step').toBeTruthy()
  expect(
    sqlValue(`SELECT require_esignature FROM workflow_instance_steps WHERE id = '${stepId}'`),
    'the APPROVAL step carries the frozen e-signature requirement',
  ).toBe('t')

  const task = await waitForAssignedTask(stepId, USERS.approver.id)
  expect(task, 'the approver holds an ASSIGNED task on the APPROVAL step').toBeTruthy()
  return { crId, instanceId, stepId, task }
}

/** The DB mirror of the Redis lock — what survives a Redis restart. */
function pinLockMirror(userId) {
  const row = sql(
    `SELECT coalesce(esign_pin_failed_count, 0),
            coalesce(esign_pin_locked_until::text, '')
       FROM users WHERE id = '${userId}'`,
  )
  const [count, lockedUntil] = row.split('|')
  return { failedCount: Number(count), lockedUntil: lockedUntil || null }
}

/** Reset both halves of the guard, so a test starts from a known state. */
function clearPinGuard(userId) {
  clearEsignPinLockout(userId)
  sql(
    `UPDATE users SET esign_pin_failed_count = 0, esign_pin_locked_until = NULL
      WHERE id = '${userId}'`,
  )
}

test.describe('PW-J20 · URS-SEC-12 signing re-authentication', () => {
  test('GATE · being signed in is not enough — the browser DEMANDS a credential', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000)

    // TC-16-10 step 1, driven through the interface rather than asserted from
    // the API. PW-J16 posts credentials directly and so can never observe this:
    // "the endpoint refuses an unsigned request" and "the product asks the user
    // for a credential" are different claims, and only the second is what a
    // person doing the executing actually sees.
    const { crId, instanceId, stepId, task } = await reachApprovalStep(page, browser, 'J19-prompt')
    clearPinGuard(USERS.approver.id)

    const ctx = await browser.newContext({ storageState: AUTH.approver })
    try {
      const approverPage = await ctx.newPage()
      await approverPage.goto(`/change-requests/${crId}`, { waitUntil: 'domcontentloaded' })

      const approve = approverPage.getByRole('button', { name: 'Approve', exact: true })
      await expect(approve.last(), 'the approver reaches their own step').toBeVisible({
        timeout: 60_000,
      })
      await approve.last().click()

      // THE ASSERTION. A live, authenticated session with an ASSIGNED task on an
      // e-sign step clicks Approve — and is stopped by a credential prompt
      // instead of the action completing. That is the whole of step 1.
      const pin = approverPage.getByPlaceholder('Enter your e-signature PIN')
      await expect(
        pin,
        'an already-signed-in user is asked for a SECOND credential before signing',
      ).toBeVisible({ timeout: 30_000 })

      // …and it is a credential DISTINCT FROM THE SESSION, which is the wording
      // URS-SEC-12 uses. The PIN is stored in its own column
      // (`users.esign_pin_hash`), not `users.password`, so holding the session
      // cookie confers nothing here. Asserted at the database: the two hashes
      // are different values, so a PIN that were merely the password would be
      // visible as equality.
      const hashes = sql(
        `SELECT coalesce(esign_pin_hash,'') = coalesce(password,'')
           FROM users WHERE id = '${USERS.approver.id}'`,
      )
      expect(hashes, 'the signing credential is not the account password').toBe('f')

      // Nothing moved while the dialog was open — the click opened a prompt, it
      // did not perform the action and then ask. Without this the assertion
      // above is satisfied by a product that approves first and prompts after.
      expect(taskStatus(task.id), 'the task is untouched while the prompt is open').toBe('ASSIGNED')
      expect(stepStatus(stepId), 'and so is the step').toBe('IN_PROGRESS')
      expect(signatureCountForInstance(instanceId), 'and nothing is signed').toBe(0)

      // ── TC-16-10 step 4: the correct credential completes it. ─────────────
      await pin.fill(ESIGN_PIN)
      await approverPage.getByRole('button', { name: 'Sign', exact: true }).click()
      await expect(pin, 'the dialog closes on a good PIN').toBeHidden({ timeout: 30_000 })
    } finally {
      await ctx.close()
    }

    await expect
      .poll(() => taskStatus(task.id), { timeout: 60_000, message: 'the approval landed' })
      .toBe('APPROVED')

    const sigs = signaturesForTask(task.id)
    expect(sigs.length, 'exactly one signature was written').toBe(1)
    expect(sigs[0].userId, 'by the person who entered the credential').toBe(USERS.approver.id)
    expect(sigs[0].meaning, 'recording what was signed').toBe('APPROVED')
  })

  test('🔴 SEC-12-D1 · a data-interface route mints a signature with NO credential', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000)

    // ── THE PROBE. See the header for the full finding. ─────────────────────
    // This is a POST from an ordinary authenticated session — no PIN, no
    // password, no OAuth token, nothing in the body but the task id, a
    // self-chosen meaning and a comment. `createSignatureSchema` does not even
    // ACCEPT a credential field (zod strips unknown keys), so there is nowhere
    // to supply one.
    const { crId, instanceId, stepId, task } = await reachApprovalStep(page, browser, 'J19-nocred')
    clearPinGuard(USERS.approver.id)
    expect(signatureCountForInstance(instanceId), 'nothing is signed yet').toBe(0)

    const ctx = await browser.newContext({ storageState: AUTH.approver })
    let signatureId = null
    try {
      const res = await ctx.request.post('/api/v1/services/signatures', {
        data: {
          taskInstanceId: task.id,
          meaning: 'APPROVED',
          comments: 'PW-J20 — minted with a session cookie and nothing else.',
        },
      })
      const body = await errorBody(res)

      // KNOWN DEFECT SEC-12-D1 — asserted AS IT BEHAVES, not as it should.
      //
      // If this ever becomes a 4xx the route has been fixed, this test goes red,
      // and that redness is the signal to rewrite it as the refusal it should
      // always have been. Writing it the other way round today would be a test
      // that fails against the shipped product, which tells nobody anything.
      expect(
        res.status(),
        'SEC-12-D1: POST /v1/services/signatures mints a Part-11 signature from an ' +
          'authenticated session alone — no credential is requested or verified. ' +
          'api/controllers/signatures.js:60 calls createSignatureRecord directly, ' +
          'bypassing verifyAndSign. 21 CFR §11.200(a)(1) is the control this ' +
          `misses. (body: ${JSON.stringify(body.raw)})`,
      ).toBe(201)

      signatureId = body.raw?.signature?.id ?? null
      expect(signatureId, 'and a real signature row came back').toBeTruthy()
    } finally {
      await ctx.close()
    }

    // ── The row is REAL, not a stub. This is what makes it a Part 11 problem
    //    rather than a cosmetic one: it is indistinguishable in the ledger from
    //    a properly verified signature, and it is what a printout, an export or
    //    an inspector would read.
    const row = sql(
      `SELECT user_id, meaning, coalesce(comments,''), payload_hash IS NOT NULL,
              signed_at IS NOT NULL
         FROM signatures WHERE id = '${signatureId}'`,
    ).split('|')
    expect(row[0], 'attributed to the caller').toBe(USERS.approver.id)
    expect(row[1], 'carrying the meaning THEY CHOSE — not one the server derived').toBe('APPROVED')
    expect(row[3], 'with a payload hash, exactly like a verified signature').toBe('t')
    expect(row[4], 'and a signing timestamp').toBe('t')

    // The caller-supplied meaning is the sharpest edge of the finding, so it is
    // demonstrated rather than merely asserted: the SAME session mints a second
    // signature on the same task claiming a DIFFERENT meaning. A server that
    // derived meaning from the action could not produce both.
    const ctx2 = await browser.newContext({ storageState: AUTH.approver })
    try {
      const rejected = await ctx2.request.post('/api/v1/services/signatures', {
        data: {
          taskInstanceId: task.id,
          meaning: 'REJECTED',
          comments: 'PW-J20 — the opposite meaning, same session, same task.',
        },
      })
      expect(
        rejected.status(),
        'SEC-12-D1 (b): the meaning is caller-supplied, so the same actor mints ' +
          'contradictory signatures on one task. Every other signing path in the ' +
          'product sets `meaning` server-side from the action taken ' +
          '(signatureService.js:287-293).',
      ).toBe(201)
    } finally {
      await ctx2.close()
    }

    const meanings = signaturesForTask(task.id).map((s) => s.meaning).sort()
    expect(
      meanings,
      'both contradictory meanings are in the ledger, on the same task',
    ).toEqual(['APPROVED', 'REJECTED'])

    // ── AND THE WORKFLOW NEVER MOVED. The signatures are free-floating: the
    //    task is still ASSIGNED, the step still IN_PROGRESS, the CR still
    //    UNDER_REVIEW. So this is not "an alternative way to approve" — it is a
    //    way to put signed attestations into the record with no action behind
    //    them, which is strictly worse.
    expect(taskStatus(task.id), 'the task never moved').toBe('ASSIGNED')
    expect(stepStatus(stepId), 'the step never moved').toBe('IN_PROGRESS')
    expect(sqlValue(`SELECT status_id FROM change_requests WHERE id = '${crId}'`)).toBe(
      'UNDER_REVIEW',
    )

    // ── CONTROL · the reviewer BINDING does work. ────────────────────────────
    // Without this the finding could be read as "the route is wide open", which
    // it is not, and the difference matters: the gap is precisely that an
    // AUTHORISATION check was fitted where §11.200 asks for an AUTHENTICATION
    // one. `author` is a tenant member who is not this task's assignee.
    const outsider = await browser.newContext({ storageState: AUTH.author })
    try {
      const refused = await outsider.request.post('/api/v1/services/signatures', {
        data: { taskInstanceId: task.id, meaning: 'APPROVED', comments: 'PW-J20 — not mine.' },
      })
      expect(
        refused.status(),
        'a non-assignee IS refused — the route has an authorisation gate, just not ' +
          'an authentication one',
      ).toBe(403)
      expect((await errorBody(refused)).message).toMatch(/assigned reviewer/i)
    } finally {
      await outsider.close()
    }

    expect(
      signaturesForTask(task.id).length,
      'the refusal wrote nothing — still just the two this test minted',
    ).toBe(2)
  })

  test('GATE · five bad PINs lock signing, in Redis AND in the database mirror', async ({
    page,
    browser,
  }) => {
    test.setTimeout(420_000)

    // TC-16-10 steps 5 and 6. PW-J16 fires exactly ONE bad PIN and then clears
    // the counter immediately (`clearEsignPinLockout`) precisely so it does not
    // trip this — which is correct for that file and leaves the lockout itself
    // completely untested.
    const { crId, instanceId, stepId, task } = await reachApprovalStep(page, browser, 'J19-lock')
    clearPinGuard(USERS.approver.id)

    expect(pinLockMirror(USERS.approver.id), 'starting from a clean guard').toEqual({
      failedCount: 0,
      lockedUntil: null,
    })

    const ctx = await browser.newContext({ storageState: AUTH.approver })
    try {
      const bad = (comment) =>
        ctx.request.post(`/api/v1/services/changeRequests/${crId}/rejectStepTask`, {
          data: {
            workflowInstanceStepId: stepId,
            comment,
            method: 'PIN',
            token: '00000000',
          },
        })

      // ── Attempts 1..4: refused individually, NOT yet locked. ───────────────
      // The boundary is the test. A guard that locked on the first failure
      // would pass any "it eventually locks" assertion while being a denial of
      // service, and one that never locked would pass any "a bad PIN is
      // refused" assertion. Both sides of MAX_ATTEMPTS are therefore driven.
      for (let i = 1; i < MAX_ATTEMPTS; i += 1) {
        const res = await bad(`PW-J20 — bad PIN ${i} of ${MAX_ATTEMPTS}.`)
        const body = await errorBody(res)
        expect(res.status(), `attempt ${i} is refused as a bad credential, not a lock`).toBe(400)
        expect(body.message, `attempt ${i} says the PIN was wrong`).toMatch(/invalid pin/i)
        expect(body.code, `attempt ${i} is not yet a lockout`).not.toBe('ESIGN_PIN_LOCKED')
      }

      // The counter is visible in the DB mirror, which is the only place an
      // administrator could ever see it — OQ-16 TC-16-10 step 6 says exactly
      // this ("demonstrating step 6 requires database access"), and this is
      // that demonstration.
      expect(
        pinLockMirror(USERS.approver.id).failedCount,
        `${MAX_ATTEMPTS - 1} failures are counted, and the account is not locked yet`,
      ).toBe(MAX_ATTEMPTS - 1)
      expect(
        pinLockMirror(USERS.approver.id).lockedUntil,
        'no lock has been set before the threshold',
      ).toBeNull()

      // ── Attempt 5: the threshold. ─────────────────────────────────────────
      const tripped = await bad('PW-J20 — the fifth and final bad PIN.')
      expect(tripped.status(), 'the threshold attempt is still refused').toBe(400)

      expect(
        pinLockMirror(USERS.approver.id).lockedUntil,
        `the ${MAX_ATTEMPTS}th failure sets the durable lock (users.esign_pin_locked_until) — ` +
          'the half that survives a Redis restart',
      ).not.toBeNull()

      // ── THE GATE. The next attempt is refused as a LOCK, and — the part that
      //    makes it a lockout rather than a slow "no" — it refuses the CORRECT
      //    PIN. A guard that let the right credential through would count
      //    failures and prevent nothing.
      const lockedOut = await ctx.request.post(
        `/api/v1/services/changeRequests/${crId}/rejectStepTask`,
        {
          data: {
            workflowInstanceStepId: stepId,
            comment: 'PW-J20 — the CORRECT PIN, while locked.',
            method: 'PIN',
            token: ESIGN_PIN,
          },
        },
      )
      const lockedBody = await errorBody(lockedOut)
      expect(
        lockedOut.status(),
        `signing must be locked after ${MAX_ATTEMPTS} failures, even for the correct ` +
          `PIN (body: ${JSON.stringify(lockedBody.raw)})`,
      ).toBe(429)
      expect(lockedBody.code, 'and says so machine-readably').toBe('ESIGN_PIN_LOCKED')
      expect(lockedBody.message, 'with a human-readable retry window').toMatch(/try again/i)

      // Nothing signed, nothing moved, throughout.
      expect(signatureCountForInstance(instanceId), 'no signature survived the lockout').toBe(0)
      expect(taskStatus(task.id), 'the task never moved').toBe('ASSIGNED')
      expect(stepStatus(stepId), 'the step never moved').toBe('IN_PROGRESS')

      // (The Redis half of the guard is the fast path and is not asserted
      // directly — `clearEsignPinLockout` is the only handle the harness has on
      // it, and a DEL cannot prove a prior SET. The DB mirror asserted above is
      // the half that actually matters for durability: it is what the guard
      // falls back to when Redis is unreachable, esignPinGuard.js:174-189.)

      // ── Step 6's other half, and it is a documented ABSENCE rather than a
      //    control: the failure is recorded as a COUNTER on the user row and
      //    NOT in the audit trail. `esign_pin_failed_count` and
      //    `esign_pin_locked_until` are not in the `users` audit trackFields, so
      //    no audit row is produced. The trail therefore cannot answer "who
      //    tried to sign what and failed".
      //
      //    KNOWN GAP SEC-12-D2 — pinned so that adding the columns to
      //    trackFields turns this red and the OQ note ("do not expect to find
      //    one") can be retired deliberately.
      await new Promise((resolve) => setTimeout(resolve, 5_000))
      expect(
        sqlValue(
          `SELECT count(*) FROM audit_logs
            WHERE entity_type = 'Users' AND entity_id = '${USERS.approver.id}'
              AND new_value_json::text ILIKE '%esignPinFailed%'`,
        ),
        'SEC-12-D2: a failed signing attempt writes NO audit entry — the counter on ' +
          'the user row is the only record, and no administrator screen shows it',
      ).toBe('0')
    } finally {
      // ALWAYS. A locked approver poisons every other spec in every project
      // that signs as this persona, for 15 minutes.
      clearPinGuard(USERS.approver.id)
      await ctx.close()
    }

    // ── And the lock really was the only thing stopping them. Clearing the
    //    guard restores signing with the same credential that was just refused,
    //    which is what proves the 429 above was a LOCKOUT and not a broken PIN.
    const after = await browser.newContext({ storageState: AUTH.approver })
    try {
      const res = await after.request.post(
        `/api/v1/services/changeRequests/${crId}/rejectStepTask`,
        {
          data: {
            workflowInstanceStepId: stepId,
            comment: 'PW-J20 — signing works again once the lock is cleared.',
            method: 'PIN',
            token: ESIGN_PIN,
          },
        },
      )
      expect(
        res.status(),
        `the same PIN succeeds once the lock is cleared (body: ${JSON.stringify(
          (await errorBody(res)).raw,
        )})`,
      ).toBe(200)
    } finally {
      await after.close()
    }

    expect(signaturesForTask(task.id).length, 'and THAT one was signed').toBe(1)
    clearPinGuard(USERS.approver.id)
  })

  test('OBSERVATION · the PASSWORD method has no lockout at all (TC-16-10 step 7)', async ({
    page,
    browser,
  }) => {
    test.setTimeout(420_000)

    // OQ-16 TC-16-10 step 7 tells the executor to "record which signing method
    // is in use" and warns that steps 5 and 6 apply to PIN only. Two things
    // about that are worth pinning as behaviour rather than prose:
    //
    //   1. An organisation cannot CHOOSE the method. There is no configuration
    //      column for it anywhere (verified by grep across migrations and the
    //      Company / OrgSecuritySettings models) — the method is whatever the
    //      client sends. The shipped dialog only ever sends PIN.
    //   2. Which means an organisation also cannot PREVENT a caller choosing
    //      PASSWORD, and `verifyEsignIdentity`'s PASSWORD branch
    //      (signatureService.js:584-587) calls neither `assertEsignPinNotLocked`
    //      nor `recordEsignPinAttempt`. Repeated wrong passwords are refused
    //      individually and indefinitely, uncounted.
    //
    // KNOWN GAP SEC-12-D3. Pinned as the measured behaviour.
    const { crId, stepId, task } = await reachApprovalStep(page, browser, 'J19-pwmethod')
    clearPinGuard(USERS.approver.id)

    const ctx = await browser.newContext({ storageState: AUTH.approver })
    try {
      // More attempts than the PIN threshold. If PASSWORD shared the guard, the
      // last of these would be a 429 — it is not.
      for (let i = 1; i <= MAX_ATTEMPTS + 2; i += 1) {
        const res = await ctx.request.post(
          `/api/v1/services/changeRequests/${crId}/rejectStepTask`,
          {
            data: {
              workflowInstanceStepId: stepId,
              comment: `PW-J20 — bad PASSWORD ${i}.`,
              method: 'PASSWORD',
              token: 'not-the-password',
            },
          },
        )
        const body = await errorBody(res)
        expect(
          res.status(),
          `SEC-12-D3: PASSWORD attempt ${i} of ${MAX_ATTEMPTS + 2} is refused individually ` +
            `and never locks (body: ${JSON.stringify(body.raw)})`,
        ).toBe(400)
        expect(body.code, `attempt ${i} is not a lockout`).not.toBe('ESIGN_PIN_LOCKED')
      }

      // And the PIN guard never saw any of it — the two methods do not share a
      // counter, which is the concrete shape of the gap.
      expect(
        pinLockMirror(USERS.approver.id),
        'SEC-12-D3: seven failed PASSWORD signings leave the guard untouched. An ' +
          'organisation signing with the account password has no signing lockout, ' +
          'and cannot configure one — there is no per-org method setting.',
      ).toEqual({ failedCount: 0, lockedUntil: null })
    } finally {
      clearPinGuard(USERS.approver.id)
      await ctx.close()
    }

    expect(taskStatus(task.id), 'and nothing moved throughout').toBe('ASSIGNED')
  })
})
