// PW-J13 · URS-SEC-23 — acting on another user's task NOTIFIES that user.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS A SEPARATE FILE FROM PW-J9
//
// PW-J9 already proves the CAPABILITY: a site-scoped editor who is neither the
// assignee nor the owner may complete and approve another user's workflow
// steps, and the signature is attributed to the actor. That is three of the
// eight steps of OQ-16 TC-16-17. The half it never looks at is step 7 —
//
//     "Sign in as Full-User and check notifications. A notification states
//      that their task was actioned, naming who did it."
//
// — and that half is the one the requirement is actually about. URS-SEC-23
// reads "the action is presented as acting on their behalf, **the assignee is
// notified**, and both identities are recorded". A takeover that is permitted,
// attributed and SILENT satisfies two of those three and still leaves the
// assignee discovering weeks later that their work was done for them. The
// product's own comment says so (`notifyAssigneeOfTakeover`, workflowStepAccess.js:
// "the first an assignee knows is finding the work already done, which is
// exactly the complaint the on-behalf-of labelling in the UI exists to
// prevent").
//
// ─────────────────────────────────────────────────────────────────────────────
// THE THREE MECHANISMS, ALL VERIFIED IN CODE BEFORE THIS FILE WAS WRITTEN
//
//  1. THE NOTIFICATION. `notifyAssigneeOfTakeover` (backend/api/utils/
//     workflowStepAccess.js:179) writes notification_type_id
//     'TASK_ACTED_BY_OTHER' with `userId = assignee` and a message naming the
//     ACTOR by "<first> <last>". Both takeover call sites reach it —
//     `workflowStepGroupService.js:324` (the per-module Mark Complete / Approve
//     path the CAPA detail page drives) and `workflowInstances.js:674` (API-15).
//
//     ⚠ IT IS A WORKER JOB, NOT A SYNCHRONOUS INSERT. `enqueueNotification`
//     (api/services/notificationQueue.js:3) is `addJob('send_notification')`,
//     so a single-shot SELECT straight after the click races graphile_worker and
//     reads as "no notification". Every assertion here sits behind
//     `waitForSqlValue`, the same barrier auditLogs/a3 needs for the same reason.
//
//     ⚠ AND IT IS BEST-EFFORT BY DESIGN. The whole body is inside a try/catch
//     that swallows and logs, because a notification failure must never roll
//     back a completed workflow action. That is the right trade — and it is
//     precisely why the notification needs a test: nothing else would ever fail
//     if it stopped being written.
//
//  2. `proxy_session_user_id` ON THE SIGNATURE. The Part-11 half of step 6:
//     "Signed by Approver-User, recording Full-User as the user whose task was
//     actioned". `signatures.user_id` is the ACTOR; `proxy_session_user_id` is
//     WHOSE TASK IT WAS, set only on a takeover
//     (`proxySessionUserId: isTakeover ? groupAssigneeId : null`,
//     workflowStepGroupService.js:430). PW-J9 asserts `user_id` and never looks
//     at the proxy column, so "both identities are recorded" is untested today.
//
//  3. THE CONTROL PAIR. A notification that fires on EVERY completion would
//     pass every assertion above while meaning nothing — so the second test
//     drives the identical workflow with the ASSIGNEES THEMSELVES acting, and
//     requires ZERO 'TASK_ACTED_BY_OTHER' rows. `notifyAssigneeOfTakeover`
//     returns early on `assigneeUserId === actorUserId`, and that early return
//     is what the control pins.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE ASSERTIONS NAME THE ACTOR RATHER THAN COUNTING ROWS
//
// "The assignee got a notification" is satisfied by a notification that says
// nothing useful. TC-16-17 step 7 asks for one that NAMES WHO DID IT, because
// the control being validated is the assignee's ability to challenge an action
// taken under their assignment. So the message text is asserted to contain the
// actor's display name, and `created_by`/`user_id` are asserted as two DIFFERENT
// people — a notification addressed to the actor, or one whose message omits
// the name, is a failure of the requirement even though a row exists.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, COMPANY_ID, ESIGN_PIN } from '../fixtures/cast.js'
import { createCapa, openCapa, uniqueTitle } from '../fixtures/capas.js'
import { signWithPin } from '../fixtures/esign.js'
import { clickWhenReady } from '../fixtures/documents.js'
import { findCapaByTitle, sql, sqlRow, sqlValue, waitForSqlValue } from '../fixtures/db.js'

/**
 * Author raises a CAPA at Primary Site and opens it, leaving Rita holding the
 * step-1 ACTION task. Identical to PW-J9's `openedCapaAt` — duplicated rather
 * than exported from it, because PW-J9 is an expected-behaviour file and this
 * one must not be able to break it by refactor.
 */
async function capaAwaitingReviewer(browser, tag) {
  const ctx = await browser.newContext({ storageState: AUTH.author })
  const page = await ctx.newPage()
  const title = uniqueTitle(tag)
  await createCapa(page, title, { siteName: 'Primary Site' })
  const capa = findCapaByTitle(title)
  await openCapa(page, capa.id)
  await ctx.close()
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
        AND assigned_to = '${USERS.reviewer.id}' AND status_id = 'ASSIGNED'`,
    { timeoutMs: 45_000, label: 'reviewer task assigned' },
  )
  return capa
}

/** How many of this CAPA's tasks have left ASSIGNED — the "it moved" signal. */
function movedTaskCount(capaId) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Capa' AND entity_id = '${capaId}'
          AND status_id NOT IN ('ASSIGNED', 'CANCELLED')`,
    ),
  )
}

/**
 * Drive a step action as its OWN assignee, retrying on a fresh load until the
 * DATABASE says the task actually moved.
 *
 * The UI offers no readiness signal for this: the button renders before the
 * step-action handler is wired, and a click in that window is a silent no-op
 * (see the long note at the call site). `clickWhenReady` exists for exactly this
 * shape but hard-codes `locator.first()`, which on this page is the wrong one of
 * two same-named controls — so this is the same idea with the locator left to
 * the caller and the success condition moved to the DB, which is the only place
 * that can answer it honestly.
 *
 * Deliberately a fresh CONTEXT per attempt, not a reload: a reload restarts the
 * syncEngine bootstrap from zero (the lesson in e2e/README.md's inspectionsLogs
 * note), so an impatient in-page retry loop makes this failure more likely.
 */
async function actOnOwnStep(browser, capaId, storageState, drive, attempts = 3) {
  const before = movedTaskCount(capaId)
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const ctx = await browser.newContext({ storageState })
    try {
      const page = await ctx.newPage()
      await page.goto(`/capas/${capaId}`, { waitUntil: 'domcontentloaded' })
      await drive(page)
      // The click may have been a no-op; the DB is what says otherwise. Poll
      // rather than assert — the action is a POST whose effect lands
      // asynchronously, so an immediate read is a race even when the click DID
      // work.
      for (let i = 0; i < 20; i += 1) {
        if (movedTaskCount(capaId) > before) return
        await new Promise((r) => setTimeout(r, 1_000))
      }
    } catch (err) {
      if (attempt === attempts) throw err
    } finally {
      await ctx.close()
    }
  }
  throw new Error(
    `actOnOwnStep: the step never moved after ${attempts} attempts on CAPA ${capaId} — ` +
      'the click is landing before the step-action handler is wired',
  )
}

/** The live ASSIGNED task on this CAPA for a given assignee, or null. */
function assignedTaskId(capaId, userId) {
  return sqlValue(
    `SELECT id FROM task_instances
      WHERE entity_type = 'Capa' AND entity_id = '${capaId}'
        AND assigned_to = '${userId}' AND status_id = 'ASSIGNED'
      ORDER BY created_at DESC LIMIT 1`,
  )
}

/**
 * Every TASK_ACTED_BY_OTHER notification addressed to `userId` for tasks on
 * this CAPA, newest first.
 *
 * Scoped by `resource_id IN (tasks of this capa)` rather than by a time window,
 * for two reasons. The suite runs `workers: 1`, but several CAPA files create
 * tasks in the same second, so a window-scoped count would pick up a sibling
 * file's takeover. And the demo seed already holds ONE `TASK_ACTED_BY_OTHER`
 * row — against a Nonconformance, with different title text and a populated
 * `created_by` — which a query scoped only by type would latch onto and read as
 * a pass before this file had done anything at all.
 */
function takeoverNotifications(capaId, userId) {
  const out = sql(
    `SELECT n.id, n.user_id, coalesce(n.created_by::text,''), n.title, n.message, n.resource_type
       FROM notifications n
      WHERE n.company_id = '${COMPANY_ID}'
        AND n.notification_type_id = 'TASK_ACTED_BY_OTHER'
        AND n.user_id = '${userId}'
        AND n.resource_id IN (
          SELECT id FROM task_instances
           WHERE entity_type = 'Capa' AND entity_id = '${capaId}')
      ORDER BY n.created_at DESC`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, recipient, createdBy, title, message, resourceType] = line.split('|')
    return { id, recipient, createdBy: createdBy || null, title, message, resourceType }
  })
}

/** count(*) of the above — the shape `waitForSqlValue` can poll. */
function takeoverNotificationCountSql(capaId, userId) {
  return `SELECT count(*) FROM notifications n
           WHERE n.company_id = '${COMPANY_ID}'
             AND n.notification_type_id = 'TASK_ACTED_BY_OTHER'
             AND n.user_id = '${userId}'
             AND n.resource_id IN (
               SELECT id FROM task_instances
                WHERE entity_type = 'Capa' AND entity_id = '${capaId}')`
}

test.describe('PW-J13 · URS-SEC-23 — the assignee is told their task was actioned', () => {
  test('a takeover notifies the assignee, names the actor, and records both identities on the signature', async ({
    browser,
  }) => {
    test.setTimeout(300_000)

    const capa = await capaAwaitingReviewer(browser, 'J13-notify')
    const reviewerTaskId = assignedTaskId(capa.id, USERS.reviewer.id)
    expect(reviewerTaskId, 'Rita holds the step-1 ACTION task').toBeTruthy()

    // Premise. Nothing has notified anybody yet, so every count below is a
    // measurement of THIS takeover rather than of the tenant's history.
    expect(
      takeoverNotifications(capa.id, USERS.reviewer.id).length,
      'no takeover notification exists before the takeover',
    ).toBe(0)

    const ctx = await browser.newContext({ storageState: AUTH.capaSiteEditor })
    const page = await ctx.newPage()
    await page.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })

    // ── TC-16-17 step 2. The affordance NAMES the assignee. Asserted before
    //    it is clicked: an unlabelled "Mark Complete" on someone else's task is
    //    the accidental-takeover failure the labelling exists to prevent, and a
    //    test that only clicked would pass against it.
    // ⚠ TWO controls carry this label, not one — measured. The step card renders
    // a small inline text button AND the primary action button, both with the
    // same accessible name, so a bare locator is a strict-mode violation before
    // anything is clicked. `.last()` is the primary action (PW-J9 gets away
    // with a bare locator only because `clickWhenReady` does not assert first).
    //
    // The COUNT is asserted rather than worked around: two labelled controls is
    // the current design, and a drop to one (or a rise to three) is a UI change
    // that should be noticed here rather than silently absorbed.
    const onBehalf = page.getByRole('button', {
      name: `Mark Complete on behalf of ${USERS.reviewer.name}`,
    })
    await expect(onBehalf.last(), 'the control says whose task this is').toBeVisible({
      timeout: 60_000,
    })
    await clickWhenReady(page, onBehalf.last())

    // ── TC-16-17 step 7, the ACTION step. The notification is enqueued to
    //    graphile_worker inside the action's transaction, so poll rather than
    //    read once.
    await waitForSqlValue(takeoverNotificationCountSql(capa.id, USERS.reviewer.id), {
      timeoutMs: 60_000,
      label: 'TASK_ACTED_BY_OTHER notification for the step-1 assignee',
    })

    const [notified] = takeoverNotifications(capa.id, USERS.reviewer.id)
    expect(notified, 'the assignee has a takeover notification').toBeTruthy()
    expect(notified.recipient, 'addressed to the ASSIGNEE, not to the actor').toBe(
      USERS.reviewer.id,
    )
    expect(
      notified.message,
      'and it NAMES the person who acted — the whole point of step 7',
    ).toContain(USERS.capaSiteEditor.name)
    expect(notified.resourceType, 'and points at the task it is about').toBe('TaskInstance')
    expect(notified.title, 'with the title the code emits').toBe(
      'Your task was actioned by someone else',
    )

    // KNOWN DEFECT SEC-23-D1: the actor is identifiable ONLY by name inside the
    // message string. `notifyAssigneeOfTakeover` (workflowStepAccess.js:193-204)
    // omits `createdBy` from the enqueueNotification payload, so
    // `notifications.created_by` lands NULL — even though the column exists, is
    // nullable, and every other notification path populates it.
    //
    // Pinned as the behaviour rather than asserted away, per the honesty rule.
    // It matters because TC-16-17 step 7's evidence is then a SUBSTRING MATCH
    // on a display name: two users called "Sana SiteEditor" in one tenant, or a
    // later profile rename, and the notification no longer identifies anybody
    // resolvably. The requirement ("the assignee is notified" naming who acted)
    // is met in the UI and NOT met as structured data.
    expect(
      notified.createdBy,
      'SEC-23-D1: created_by is NULL on the takeover path — the actor is carried ' +
        'only as text in `message`. If this ever becomes non-null the defect is ' +
        'fixed and this assertion should flip to naming the actor.',
    ).toBeNull()

    // ── The approver's turn. Step 2 is APPROVAL + e-signature, which is where
    //    the Part-11 half of step 6 becomes observable at all.
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
          AND assigned_to = '${USERS.approver.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 45_000, label: 'approver task after the takeover completion' },
    )
    const approverTaskId = assignedTaskId(capa.id, USERS.approver.id)
    expect(approverTaskId, 'Adam holds the step-2 APPROVAL task').toBeTruthy()

    await clickWhenReady(
      page,
      page.getByRole('button', { name: `Approve on behalf of ${USERS.approver.name}` }).last(),
    )
    const pin = page.getByPlaceholder('Enter your e-signature PIN')
    await expect(pin, 'the e-signature prompt opens for the takeover too').toBeVisible({
      timeout: 15_000,
    })
    await pin.fill(ESIGN_PIN)
    await page.getByRole('button', { name: 'Sign' }).click()

    await waitForSqlValue(
      `SELECT count(*) FROM workflow_instances
        WHERE resource_type = 'Capa' AND resource_id = '${capa.id}' AND status_id = 'COMPLETED'`,
      { timeoutMs: 60_000, label: 'workflow completed by the site-scoped editor' },
    )
    await ctx.close()

    // ── TC-16-17 step 7 again, for the approver. Two takeovers, two
    //    notifications, each to the right person — which is what rules out a
    //    single broadcast standing in for per-assignee notice.
    await waitForSqlValue(takeoverNotificationCountSql(capa.id, USERS.approver.id), {
      timeoutMs: 60_000,
      label: 'TASK_ACTED_BY_OTHER notification for the step-2 assignee',
    })
    const [approverNotice] = takeoverNotifications(capa.id, USERS.approver.id)
    expect(approverNotice.recipient).toBe(USERS.approver.id)
    expect(approverNotice.message).toContain(USERS.capaSiteEditor.name)

    // And the editor — who did the acting — is told nothing. A notification
    // addressed to the actor would mean the recipient is being derived from
    // the wrong identity, which is the failure mode that reads as "it works"
    // on a count-only assertion.
    expect(
      takeoverNotifications(capa.id, USERS.capaSiteEditor.id).length,
      'the actor is not notified about their own action',
    ).toBe(0)

    // ── TC-16-17 step 6. BOTH identities on the Part-11 record.
    const sig = sqlRow(
      `SELECT s.user_id, coalesce(s.proxy_session_user_id::text, ''), s.meaning
         FROM signatures s
        WHERE s.task_instance_id = '${approverTaskId}'
        ORDER BY s.signed_at DESC LIMIT 1`,
    )
    expect(sig, 'the approval wrote a signature').toBeTruthy()
    expect(sig[0], 'signed BY the actor — they are the one attesting').toBe(
      USERS.capaSiteEditor.id,
    )
    expect(sig[2], 'with the meaning of the action taken').toBe('APPROVED')

    // ── KNOWN DEFECT SEC-23-D2 (the SAME defect workflow/PW-J17 pins red) ────
    // The second identity is NOT recorded on this path. `handleWorkflowAction`
    // passes `proxySessionUserId: isTakeover ? assigneeUserId : null` into
    // `verifyAndSign` (controllers/documents/workflowInstances.js:667), but
    // `verifyAndSign` (services/signatureService.js) never destructures that
    // parameter, so it is dropped and `createSignatureRecord` runs on its
    // `proxySessionUserId = null` default.
    //
    // WHICH PATH THIS IS, AND WHY IT MATTERS HERE. The CAPA detail page's
    // single-step "Approve on behalf of" posts to
    // `/v1/services/taskInstances/:id/action` (WorkflowStepActionsMenu.vue:235)
    // — API-15, the defective path. The GROUPED path
    // (`/completeGroup`, WorkflowStepGroup.vue:239 → workflowStepGroupService
    // `signStep`, which takes and forwards `proxySessionUserId`) is CORRECT. So
    // the repository already contains the intended behaviour and exactly one
    // route drops it — which is why this is a two-line fix rather than a design
    // question.
    //
    // PINNED AS-IS rather than softened. URS-SEC-23 requires "both identities
    // are recorded in the audit trail AND signature"; the audit trail half holds
    // (asserted below), the signature half does not. Asserting `null` here is
    // NOT a manufactured pass: it is the measurement, and the day the two lines
    // land in `verifyAndSign` this goes red and is the signal to flip it to
    // `.toBe(USERS.approver.id)` — the assertion workflow/PW-J17 already carries
    // in that form, deliberately failing.
    expect(
      sig[1] || null,
      'SEC-23-D2: verifyAndSign drops proxySessionUserId, so an API-15 takeover ' +
        'signature carries NO record of whose task it was. See workflow/PW-J17, ' +
        'which asserts the CORRECT value and is red today.',
    ).toBeNull()

    // ── TC-16-17 step 5. The audit trail attributes the action to the ACTOR.
    //
    //    This is the half of "both identities are recorded" that DOES hold, and
    //    it is what keeps SEC-23-D2 a gap rather than a total absence of
    //    attribution: `audit_logs.performed_by` comes from the
    //    `app.current_user_id` GUC that `requireCompanyAccess` sets
    //    transaction-locally, so it names whoever made the request — the ACTOR.
    //
    //    `entity_type` is the PLURALISED model name ('TaskInstances'), not the
    //    singular `entityType` on `task_instances` itself. Getting that wrong
    //    returns zero rows and the assertion passes vacuously.
    expect(
      sqlValue(`SELECT status_id FROM task_instances WHERE id = '${approverTaskId}'`),
      'the approval really happened',
    ).toBe('APPROVED')

    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs
        WHERE entity_type = 'TaskInstances' AND entity_id = '${approverTaskId}'
          AND performed_by = '${USERS.capaSiteEditor.id}'`,
      { timeoutMs: 60_000, label: 'audit row attributing the takeover to the actor' },
    )
    // And NOT to the assignee. An audit row crediting Adam for something Sana
    // did would be worse than no capability at all — it is the failure mode the
    // on-behalf-of labelling exists to make impossible.
    expect(
      sqlValue(
        `SELECT count(*) FROM audit_logs
          WHERE entity_type = 'TaskInstances' AND entity_id = '${approverTaskId}'
            AND performed_by = '${USERS.approver.id}'`,
      ),
      'no audit row credits the assignee for an action they did not take',
    ).toBe('0')
  })

  test('CONTROL · an assignee acting on their OWN task notifies nobody', async ({ browser }) => {
    test.setTimeout(300_000)

    // Without this, every assertion above is satisfied by a product that
    // notifies on every completion — which would be noise, not a takeover
    // control. `notifyAssigneeOfTakeover` returns early when actor === assignee
    // (workflowStepAccess.js:187); this is the only test that can tell that
    // early return from a missing one.
    const capa = await capaAwaitingReviewer(browser, 'J13-control')

    // ── Rita completes her OWN step. ────────────────────────────────────────
    //
    // ⚠ THIS STEP NEEDS A DB-CONFIRMED RETRY, and the reason is worth writing
    // down because the failure is silent and reads as a product bug.
    //
    // TWO controls on the step card carry the accessible name "Mark Complete":
    // a small inline text button (first in DOM order) and the primary action
    // button. `clickWhenReady` takes `locator.first()`, so the shared
    // `completeReviewerStep` fixture drives the inline one. But that is not the
    // whole story — a standalone probe showed `.last()` clicking cleanly, the
    // POST to `/v1/services/taskInstances/:id/action` returning 200 and the task
    // reaching APPROVED. What fails intermittently is the click landing BEFORE
    // the step-action handler is wired, which is exactly the "visible is not the
    // same as WIRED" no-op `clickWhenReady`'s own header describes: no dialog,
    // no error, no state change.
    //
    // Measured across five runs: the click succeeded in isolation every time and
    // failed roughly half the time inside the full file, where the preceding
    // CAPA-create context leaves the machine busier. So the fix is not a better
    // locator — it is to treat "the task moved" as the success condition and
    // re-drive on a fresh context if it did not. Polling the DB is the only
    // honest readiness signal here; the UI gives none.
    //
    // NOTE the shared suite has the same flake independently of this file —
    // `fillCapaCreateForm`'s keyboard select times out intermittently, and
    // PW-J9 (untouched by this work) fails on it too. That one is not mine to
    // fix and is reported rather than worked around.
    //
    // The labelling half is asserted here too: her own task must NOT be
    // presented as a takeover. That is the UI mirror of the notification
    // control — an "on behalf of" label on your own task would train people to
    // ignore it on someone else's.
    await actOnOwnStep(browser, capa.id, AUTH.reviewer, async (page) => {
      const own = page.getByRole('button', { name: 'Mark Complete', exact: true })
      await expect(own.last(), 'the assignee sees her own task').toBeVisible({ timeout: 60_000 })
      await expect(
        page.getByRole('button', { name: /on behalf of/ }),
        'her own task is not presented as a takeover',
      ).toHaveCount(0)
      await own.last().click()
    })

    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
          AND assigned_to = '${USERS.approver.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 60_000, label: 'approver task after the assignee completed step 1' },
    )

    // ── Adam approves his OWN step, e-signing it. ───────────────────────────
    await actOnOwnStep(browser, capa.id, AUTH.approver, async (page) => {
      // `exact: true` — "Approve" also matches the profile-menu button in the
      // header (fixtures/capas.js documents the same trap).
      const approve = page.getByRole('button', { name: 'Approve', exact: true })
      await expect(approve.last()).toBeVisible({ timeout: 60_000 })
      await approve.last().click()
      await signWithPin(page)
    })

    // NOT "the workflow reached COMPLETED". The seeded CAPA workflow has a THIRD
    // step after the approval (measured: a task lands on `author` once the
    // approver signs), so waiting on COMPLETED here would hang on a step this
    // test has no reason to drive. The property under test is that the two
    // assignee-driven actions notified nobody, and the barrier for that is the
    // approval itself having landed.
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
          AND assigned_to = '${USERS.approver.id}' AND status_id = 'APPROVED'`,
      { timeoutMs: 60_000, label: 'the approver approved their own step' },
    )

    // The settle is the same one ALD-A3 needs and for the same reason: a
    // negative assertion about a WORKER-written row needs a window in which the
    // worker could have written it, or it passes before the thing it is
    // watching for could have happened. The approval landing is the barrier for
    // the action; this covers the enqueue→run hop behind it.
    await new Promise((resolve) => setTimeout(resolve, 8_000))

    expect(
      takeoverNotifications(capa.id, USERS.reviewer.id).length,
      'an assignee completing their own step notifies nobody',
    ).toBe(0)
    expect(
      takeoverNotifications(capa.id, USERS.approver.id).length,
      'and neither does an approver approving their own',
    ).toBe(0)

    // And the AUDIT attribution is the assignee's own id here — the mirror of
    // test 1's "the actor, not the assignee". Asserted on audit_logs rather
    // than on `proxy_session_user_id`, because while SEC-23-D2 is open that
    // column is NULL on BOTH paths and could not tell them apart.
    const approverTaskId = sqlValue(
      `SELECT id FROM task_instances
        WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
          AND assigned_to = '${USERS.approver.id}'
        ORDER BY created_at DESC LIMIT 1`,
    )
    await waitForSqlValue(
      `SELECT count(*) FROM audit_logs
        WHERE entity_type = 'TaskInstances' AND entity_id = '${approverTaskId}'
          AND performed_by = '${USERS.approver.id}'`,
      { timeoutMs: 60_000, label: 'audit row attributing the self-action to the assignee' },
    )
  })
})
