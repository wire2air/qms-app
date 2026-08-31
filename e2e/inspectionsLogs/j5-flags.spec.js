// IL-J5 — Flags: the exception channel out of a log book.
//
// A flag is the one thing in this module a floor user can raise about an entry
// without any permission at all — deliberately, because the person who notices
// the anomaly is the person holding the tablet. Raising is open to any member
// of the tenant; RESOLVING is gated on `field_records:review` at the route
// itself (`enforcePermission`), which makes the pair a clean asymmetry to test.
//
// Raising has three side effects, and only the first is visible on screen:
//   1. the flag row itself,
//   2. a REVIEW task in the log book supervisor's unified inbox, tied to the
//      flag via `source_id` so resolving the flag closes the task,
//   3. an INSTANT notification to the supervisor that deliberately bypasses the
//      book's `notify_on_submit` digest preference — a flag is an exception,
//      not routine traffic — and whose TYPE changes with severity.
//
// ✅ THE SECOND HALF OF THIS JOURNEY FOUND A LIVE DEFECT (IL-D1) AND NOW GUARDS
// THE FIX. Resolving a flag was impossible through the product whenever the log
// book had a supervisor — which is every book that routes flags anywhere.
// `fieldRecordFlagService.resolveFlag()` closed the task the flag spawned with
// `statusId: 'RESOLVED'`, and there is no RESOLVED row in `task_instance_statuses`
// (APPROVED, ASSIGNED, CANCELLED, CHANGES_REQUESTED, FORM_SUBMITTED,
// IN_PROGRESS, REASSIGNED, REJECTED, SENT_BACK, SUPERSEDED). The FK on
// `task_instances.status_id` rejected it, the surrounding transaction rolled
// back — taking the flag's own `resolved_at` with it — and the flag stayed open
// forever. The service's own comment, "a flag is resolved, not approved", says
// the status was meant to exist and was never added.
//
// It survived because it is invisible on the books that would have caught it:
// a book with no supervisor spawns no task, so the UPDATE matched nothing and
// resolving appeared to work. It failed only where there was oversight.
//
// Fixed 2026-09-01 (close the task with APPROVED, the vocabulary's "closed,
// done" terminal, as moduleRecordService.js:527 already does). The test below
// was written the other way round — asserting the 400 — and is now flipped to
// assert the resolution path, so a regression fails rather than passing quietly.
import { test, expect } from '@playwright/test'
import { AUTH, INSPECTIONS_LOGS, USERS } from '../fixtures/cast.js'
import {
  createPersonaPool,
  errorMessage,
  flagsOf,
  notificationsFor,
  openEntry,
  raiseFlag,
  restPatch,
  submitEntry,
  tasksFor,
  uniqueTag,
} from '../fixtures/inspectionsLogs.js'

const OPS = INSPECTIONS_LOGS.operations

const pool = createPersonaPool()
test.afterAll(() => pool.close())

async function fileEntry(browser, tag) {
  const page = await pool.page(browser, AUTH.logOperator)
  const record = await submitEntry(page, {
    book: OPS,
    values: { Operator: tag, Reading: '77.0', Note: 'Looks off' },
    submitterId: USERS.logOperator.id,
  })
  return { page, record }
}

test.describe('IL-J5 — raise and resolve a flag', () => {
  test('an operator raises a flag, it reaches the supervisor, and the supervisor closes it', async ({
    browser,
  }) => {
    const tag = uniqueTag('J5')
    const { page, record } = await fileEntry(browser, tag)

    const flag = await raiseFlag(page, record.id, {
      severity: 'WARN',
      notes: 'Reading drifted 5 points above the previous shift with no changeover logged.',
    })

    expect(flag.severity).toBe('WARN')
    expect(flag.resolved).toBe(false)
    expect(flag.flaggedByUserId, 'raised by the operator, who holds no review permission').toBe(
      USERS.logOperator.id,
    )
    expect(flag.notes).toMatch(/drifted 5 points/)

    // Side effect 2 — the supervisor's inbox. The task is keyed to the FLAG
    // (source_id), not just the record, which is what lets resolving close it.
    const tasks = tasksFor({ sourceId: flag.id })
    expect(tasks, 'the flag materialises one supervisor task').toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      kind: 'REVIEW',
      statusId: 'ASSIGNED',
      assignedTo: USERS.logSupervisor.id,
      entityType: 'FieldRecord',
    })

    // Side effect 3 — the notification, routed to the supervisor rather than
    // the submitter, and typed by severity.
    const notes = notificationsFor(record.id)
    expect(notes.map((n) => n.typeId)).toContain('FIELD_RECORD_FLAGGED')
    expect(
      notes.find((n) => n.typeId === 'FIELD_RECORD_FLAGGED').userId,
      'flags route to the book supervisor, not the person who filed the entry',
    ).toBe(USERS.logSupervisor.id)

    // ── IL-D1, now FIXED — this is the regression guard ───────────────────
    //
    // This half of the journey was written as a known-defect assertion: it
    // pinned a 400. `resolveFlag()` closed the flag's supervisor task with
    // `statusId: 'RESOLVED'`, and there is no RESOLVED row in
    // `task_instance_statuses`, so `task_instances_status_id_fkey` rejected the
    // write and the WHOLE transaction rolled back — taking the flag's own
    // `resolved_at` with it. No flag could be resolved on any log book that has
    // a supervisor, which is to say on exactly the books with oversight. A book
    // without a supervisor spawns no task, the UPDATE matched nothing, and
    // resolving appeared to work; that is how it survived.
    //
    // Fixed 2026-09-01 by closing the task with APPROVED — the vocabulary's
    // "closed, done" terminal, and what moduleRecordService.js:527 already uses
    // for the same job. Asserted forwards now, so a regression is a failure
    // rather than a silently-passing known defect.
    const supPage = await pool.page(browser, AUTH.logSupervisor)
    const res = await restPatch(supPage, `/fieldRecordFlags/${flag.id}/resolve`, {
      resolutionNotes: 'Changeover was logged late in the maintenance book; no product impact.',
    })
    expect(res.status(), 'IL-D1 regression — the resolve write is failing again').toBe(200)

    const closed = flagsOf(record.id)[0]
    expect(closed.resolved, 'the flag is closed').toBe(true)
    expect(closed.resolvedByUserId, 'by the supervisor who judged it').toBe(USERS.logSupervisor.id)
    expect(closed.resolutionNotes).toMatch(/no product impact/i)
    expect(
      tasksFor({ sourceId: flag.id })[0].statusId,
      'and the task has left the supervisor inbox',
    ).toBe('APPROVED')
  })

  test('a CRITICAL flag escalates on a different notification type, and its author cannot close it', async ({
    browser,
  }) => {
    const tag = uniqueTag('J5C')
    const { page, record } = await fileEntry(browser, tag)

    const flag = await raiseFlag(page, record.id, {
      severity: 'CRITICAL',
      notes: 'Cold room read 9.4 °C — excursion, product quarantined pending assessment.',
    })

    expect(flag.severity).toBe('CRITICAL')
    expect(
      notificationsFor(record.id).map((n) => n.typeId),
      'critical raises a distinct type so it can bypass digest preferences downstream',
    ).toContain('FIELD_RECORD_FLAGGED_CRITICAL')

    // Raising is open to everyone; resolving is not. The operator who raised
    // this flag is looking at it and is offered no way to close it.
    await openEntry(page, record.id)
    // Prove the flag is ON SCREEN before asserting the control is missing —
    // otherwise an empty flags list (nothing synced yet) satisfies the
    // expectation for the wrong reason.
    await expect(
      page.getByText(/Open flags \(1\)/),
      'the author can see their own open flag',
    ).toBeVisible({ timeout: 20_000 })
    await expect(
      page.getByRole('button', { name: 'Resolve', exact: true }),
      'the flag author is not offered the resolve control',
    ).toHaveCount(0)

    // And the route refuses it directly — `enforcePermission('field_records',
    // 'review')` sits in front of the controller, so this is a permission
    // refusal rather than the reviewer-of-this-book check IL-J3 exercises.
    const res = await restPatch(page, `/fieldRecordFlags/${flag.id}/resolve`, {
      resolutionNotes: 'Closing my own flag',
    })
    const status = res.status()
    const message = await errorMessage(res)
    expect(status).toBe(403)
    expect(message).toMatch(/not permitted to review on field_records/i)

    expect(flagsOf(record.id)[0].resolved, 'the flag is still open').toBe(false)
  })
})
