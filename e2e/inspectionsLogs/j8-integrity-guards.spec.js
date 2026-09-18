// IL-J8 — The three integrity guards, probed straight at the database.
//
// These are the module's top three security-review findings (11-security-review
// §1/§2/§3), and the module's own journey spec (14-playwright-journeys, PW-J8 /
// PW-J9 / PW-J10) was written on the assumption they would still be open:
// "written to FAIL against current code… flip to release gates once the top
// conditions are fixed." Measured against the live database on 2026-08-31, all
// three are now CLOSED, so these are written the other way round — as the
// regression guards that keep them closed.
//
// What each finding was, in one line:
//   #1 CRITICAL — `field_record_revisions` had no permission clause on UPDATE
//      (company_id was the whole gate) and a column-list immutability trigger
//      that named six of nineteen columns, omitting `signature_id`, `comment`,
//      `review_outcome` and `void_reason`. Any authenticated member could
//      repoint the Part-11 signature on a historic revision, or rewrite the
//      stated reason for a void.
//   #2 CRITICAL — `field_records` UPDATE collapsed to
//      "…OR submitted_by_user_id = self", with no status trigger behind it. The
//      author of any entry could set it APPROVED, skipping the lock window, the
//      signature and the entire review state machine.
//   #3 HIGH — the assignee arm of `assignment_instances` UPDATE let a user
//      force-complete their own scheduled occurrence with no record behind it.
//
// EVERY PROBE IS TWO-SIDED. A refusal is only evidence if the request would
// otherwise have reached the row, and RLS filtering is silent: an UPDATE that
// matches nothing SUCCEEDS against zero rows. So each finding is probed both
// with a persona the policy admits (expect a raised error) and, where the two
// layers differ, with one it does not (expect zero rows touched) — otherwise a
// policy that quietly stopped matching anything would read as a passing guard.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, INSPECTIONS_LOGS, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import {
  affectedRows,
  createDueInstance,
  createPersonaPool,
  findInstance,
  findRecord,
  revisionsOf,
  signaturesOf,
  submitEntry,
  uniqueTag,
} from '../fixtures/inspectionsLogs.js'

const OPS = INSPECTIONS_LOGS.operations
const CTRL = INSPECTIONS_LOGS.controlled

const pool = createPersonaPool()
test.afterAll(() => pool.close())

test.describe('IL-J8 — integrity guards (security-review #1/#2/#3)', () => {
  test('finding #1 — a signed revision cannot be rewritten, and its signature cannot be detached', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.logOperator)
    const record = await submitEntry(page, {
      book: CTRL,
      values: { Area: uniqueTag('J8S'), Temperature: '5.0' },
      submitterId: USERS.logOperator.id,
    })

    const revisionId = record.currentRevisionId
    expect(signaturesOf(record.id), 'the probe needs a genuinely signed revision').toHaveLength(1)

    // Layer 1 — the UPDATE policy. The operator holds none of amend/void/review,
    // so the row is not even reachable. Silent: zero rows, no error.
    const operator = sqlAsAppUser(
      `UPDATE field_record_revisions SET comment = 'rewritten' WHERE id = '${revisionId}' RETURNING id;`,
      { userId: USERS.logOperator.id, companyId: COMPANY_ID },
    )
    expect(
      affectedRows(operator),
      'a member without amend/void/review cannot reach the row at all',
    ).toBe(0)

    // Layer 2 — the trigger. The supervisor DOES hold `field_records:review`, so
    // the policy admits them and the append-only guard has to do the work. This
    // is the half that finding #1 was actually about: a legitimate reviewer
    // rewriting history in place instead of appending to it.
    const rewrite = sqlAsAppUser(
      `UPDATE field_record_revisions SET comment = 'rewritten' WHERE id = '${revisionId}';`,
      { userId: USERS.logSupervisor.id, companyId: COMPANY_ID },
    )
    expect(rewrite.ok, 'a reviewer cannot rewrite a revision in place').toBeFalsy()
    expect(rewrite.error).toMatch(/append-only/i)

    // The evidence itself: detaching or repointing the signature.
    const detach = sqlAsAppUser(
      `UPDATE field_record_revisions SET signature_id = NULL WHERE id = '${revisionId}';`,
      { userId: USERS.logSupervisor.id, companyId: COMPANY_ID },
    )
    expect(detach.ok, 'a recorded e-signature cannot be detached').toBeFalsy()
    expect(detach.error).toMatch(/signature/i)

    expect(revisionsOf(record.id)[0].signed, 'the signature is still attached').toBe(true)
    expect(revisionsOf(record.id)[0].comment, 'and the revision reads as written').toBeNull()
  })

  test('finding #2 — the author of an entry cannot approve it behind the review workflow', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.logOperator)
    const record = await submitEntry(page, {
      book: OPS,
      values: { Operator: uniqueTag('J8A'), Reading: '10.0', Note: 'Self-approval attempt' },
      submitterId: USERS.logOperator.id,
    })

    // The submitter arm of `field_records_update_rls` still admits them — that
    // is the policy's shape and it is not what closed the finding. The
    // lifecycle trigger is.
    const selfApprove = sqlAsAppUser(
      `UPDATE field_records SET status_id = 'APPROVED' WHERE id = '${record.id}';`,
      { userId: USERS.logOperator.id, companyId: COMPANY_ID },
    )
    expect(selfApprove.ok, 'the submitter cannot promote their own entry').toBeFalsy()
    expect(selfApprove.error).toMatch(/cannot be edited directly/i)

    // The neighbouring bypasses the same branch used to open up: escaping the
    // lock window, and forging the void facts.
    const unlock = sqlAsAppUser(
      `UPDATE field_records SET lock_at = NULL, lock_reason = NULL WHERE id = '${record.id}';`,
      { userId: USERS.logOperator.id, companyId: COMPANY_ID },
    )
    expect(unlock.ok, 'nor push their own edit window back out').toBeFalsy()

    const forgeVoid = sqlAsAppUser(
      `UPDATE field_records SET status_id = 'VOIDED', voided_at = NOW(),
              voided_by_user_id = '${USERS.logOperator.id}', void_reason = 'forged'
        WHERE id = '${record.id}';`,
      { userId: USERS.logOperator.id, companyId: COMPANY_ID },
    )
    expect(forgeVoid.ok, 'nor void it without the signed void path').toBeFalsy()

    const after = findRecord(record.id)
    expect(after.statusId, 'the entry is exactly where the service left it').toBe('SUBMITTED')
    expect(after.lockAt).toBeTruthy()
    expect(after.voidedAt).toBeNull()
    expect(revisionsOf(record.id), 'and no revision was fabricated').toHaveLength(1)
  })

  test('finding #3 — a scheduled occurrence cannot be resolved by a direct write', async () => {
    const instance = createDueInstance({ book: OPS, userId: USERS.logOperator.id })

    // Layer 1 — the UPDATE policy. The old assignee arm was a bare
    // `assigned_to_user_id = self`; it now also demands `inspections:skip`, and
    // the operator holds neither that nor `inspections:assign`. So the assignee
    // — the exact persona the finding was about — cannot reach their own row.
    // Silent, as RLS always is: zero rows, no error.
    const assignee = sqlAsAppUser(
      `UPDATE assignment_instances
          SET status_id = 'COMPLETED', completed_at = NOW()
        WHERE id = '${instance.id}' RETURNING id;`,
      { userId: USERS.logOperator.id, companyId: COMPANY_ID },
    )
    expect(
      affectedRows(assignee),
      'the assignee alone can no longer reach their own occurrence',
    ).toBe(0)

    // Layer 2 — the trigger, which is what makes the first layer more than an
    // accident of who happens to hold what. logAdmin holds `inspections:assign`,
    // so the policy lets them at ANY occurrence in the tenant — and the write is
    // still refused, because completing an occurrence has to mean an entry was
    // actually filed. The only route to COMPLETED is submitting one (IL-J6).
    const forge = sqlAsAppUser(
      `UPDATE assignment_instances
          SET status_id = 'COMPLETED', completed_at = NOW()
        WHERE id = '${instance.id}';`,
      { userId: USERS.logAdmin.id, companyId: COMPANY_ID },
    )
    expect(forge.ok, 'not even a scheduler can mark an occurrence done by hand').toBeFalsy()
    expect(forge.error).toMatch(/cannot be resolved directly/i)

    // Skipping is a real product action (POST …/skip) with its own reason and,
    // for controlled books, its own signature — so the raw write is refused for
    // that too, not merely for COMPLETED.
    const skip = sqlAsAppUser(
      `UPDATE assignment_instances SET status_id = 'SKIPPED', skipped_at = NOW()
        WHERE id = '${instance.id}';`,
      { userId: USERS.logAdmin.id, companyId: COMPANY_ID },
    )
    expect(skip.ok, 'nor skip it without going through the endpoint').toBeFalsy()

    const after = findInstance(instance.id)
    expect(after.statusId, 'the obligation still stands').toBe('DUE')
    expect(after.completedRecordId).toBeNull()
  })

  test('a log book’s status is moved by its workflow, never by a direct write', async () => {
    // The sibling guard, and the reason the three above are worth having: this
    // one has been in place since the supersede model landed, and it is what
    // stops an ACTIVE book being paused (so entries stop being accepted) or an
    // unapproved DRAFT being switched on. `logAdmin` owns the book, so RLS
    // admits the write and the trigger is genuinely the thing refusing it.
    const attempt = sqlAsAppUser(
      `UPDATE log_books SET status_id = 'INACTIVE' WHERE id = '${OPS.id}';`,
      { userId: USERS.logAdmin.id, companyId: COMPANY_ID },
    )
    expect(attempt.ok).toBeFalsy()
    expect(attempt.error).toMatch(/status cannot be changed directly/i)
    expect(
      sqlValue(`SELECT status_id FROM log_books WHERE id = '${OPS.id}'`),
      'the book is still accepting entries',
    ).toBe('ACTIVE')
  })
})
