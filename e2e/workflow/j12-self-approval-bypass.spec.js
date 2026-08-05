// PW-J12 · F-02 — self-approval on the per-approver ledger.
//
// `users_on_workflow_instance_steps` is the row that records WHO APPROVED WHAT.
// `users_on_awis_update_rls` permitted `user_id = current_user_id` with no
// permission term and no signature requirement, so an assignee could set their
// own ledger row to APPROVED directly — indistinguishable, in the row itself,
// from a legitimate approval that `approveTaskInstance` had written in bulk when
// the step closed.
//
// Two things made it worse than it looks. There is no e-signature anywhere on
// that path — the Part-11 requirement lives only in application code on API-15.
// And per F-17 the audit registry keyed this table under a name that has never
// existed (`workflow_instance_step_users`), so `USER_APPROVED` was never emitted
// and a hand-set value left almost no trace.
//
// Closed by the same trust boundary as F-01 (migration 20260731120000). F-17 is
// fixed separately, so the legitimate approvals that DO flow through the trusted
// path now reach the audit trail.
//
// ⚠️ Flipped from red-by-design to a green release gate. Must stay green.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID } from '../fixtures/cast.js'
import { sqlValue, sqlAsAppUser } from '../fixtures/db.js'
import { createLiveWorkflowInstance, anyAssignmentOn } from '../fixtures/workflow.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J12 · F-02 self-approval bypass', () => {
  test('an assignee cannot write their OWN approval-ledger row to APPROVED', async ({ page }) => {
    test.setTimeout(180_000)

    const { instanceId } = await createLiveWorkflowInstance(page, 'J12-selfapprove')
    const assignment = anyAssignmentOn(instanceId)
    expect(assignment, 'the submitted instance has an assignment to self-approve').toBeTruthy()

    // The persona is the SUBJECT of the row — the one case the old policy
    // explicitly permitted.
    const self = { userId: assignment.userId, companyId: COMPANY_ID }
    const before = assignment.statusId

    for (const target of ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']) {
      const res = sqlAsAppUser(
        `UPDATE users_on_workflow_instance_steps SET status_id = '${target}'
          WHERE id = '${assignment.id}';`,
        self,
      )
      expect(res.ok, `self-writing the ledger to ${target} must be rejected`).toBe(false)
      expect(res.error, 'rejection carries the QMSWF guard').toMatch(
        /status cannot be changed directly|QMSWF/i,
      )
    }

    expect(
      sqlValue(`SELECT status_id FROM users_on_workflow_instance_steps WHERE id = '${assignment.id}'`),
      'the approval ledger row is untouched',
    ).toBe(before)
  })

  test('CONTROL: the guard is on status_id only — other columns still writable', async ({ page }) => {
    test.setTimeout(180_000)

    const { instanceId } = await createLiveWorkflowInstance(page, 'J12-control')
    const assignment = anyAssignmentOn(instanceId)

    const res = sqlAsAppUser(
      `UPDATE users_on_workflow_instance_steps SET updated_at = NOW() WHERE id = '${assignment.id}';`,
      { userId: assignment.userId, companyId: COMPANY_ID },
    )
    expect(res.ok, 'a non-lifecycle write is still permitted').toBe(true)
  })
})
