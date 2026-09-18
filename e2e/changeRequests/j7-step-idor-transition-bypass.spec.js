// PW-J7 · step IDOR + status-transition bypass (P0, security).
//
// The authoritative CRUD write path for `change_requests` is PostGraphile
// auto-CRUD running as DB role `app_user`. RLS gates the ROW (company +
// change_control permission) but never inspects the NEW VALUE, so any guard
// living only in the REST controller is bypassable by a raw mutation. CR-C1
// closes that with the `enforce_cr_status_transition` trigger (ERRCODE QMSCR);
// these tests drive the real untrusted role to prove it.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, ALT_USERS, COMPANY_ID } from '../fixtures/cast.js'
import {
  createCr,
  assignDraftReviewers,
  submitCrForApproval,
  completeReviewerStep,
  completeApproverStep,
  stepIdByName,
  uniqueTitle,
} from '../fixtures/changeRequests.js'
import { findCrByTitle, sqlValue, sqlAsAppUser, waitForSqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

const asAuthor = { userId: USERS.author.id, companyId: COMPANY_ID }

test.describe('PW-J7 · transition-guard + step IDOR', () => {
  test('app_user cannot change a CR status directly → QMSCR', async ({ page }) => {
    test.setTimeout(120_000)
    const title = uniqueTitle('J7-bypass')
    await createCr(page, title)
    const cr = findCrByTitle(title)
    expect(cr.statusId).toBe('DRAFT')

    // Self-approve / self-close attempts — the exact escalation CR-C1 blocks.
    for (const target of ['OPEN', 'CLOSED', 'CANCELLED']) {
      const res = sqlAsAppUser(
        `UPDATE change_requests SET status_id = '${target}' WHERE id = '${cr.id}';`,
        asAuthor,
      )
      expect(res.ok, `raw GraphQL-role status write to ${target} must be rejected`).toBe(false)
      expect(res.error, `${target} rejection carries the QMSCR guard`).toMatch(
        /status cannot be changed directly|QMSCR/i,
      )
    }

    // Untouched.
    expect(sqlValue(`SELECT status_id FROM change_requests WHERE id = '${cr.id}'`)).toBe('DRAFT')
  })

  test('app_user cannot INSERT a change request in a non-DRAFT status → QMSCR', async () => {
    const res = sqlAsAppUser(
      `INSERT INTO change_requests
         (id, company_id, cr_number, title, status_id, change_type_id, priority_id,
          site_id, department_id, owner_id, initiated_at, created_by, updated_by, created_at, updated_at)
       SELECT gen_random_uuid(), '${COMPANY_ID}', 'CR-E2E-BYPASS-001', 'E2E J7 bypass insert',
              'CLOSED', 'PROCESS', 'MEDIUM', s.id, d.id,
              '${USERS.author.id}', NOW(), '${USERS.author.id}', '${USERS.author.id}', NOW(), NOW()
         FROM sites s, departments d
        WHERE s.company_id = '${COMPANY_ID}' AND d.company_id = '${COMPANY_ID}'
        LIMIT 1;`,
      asAuthor,
    )
    expect(res.ok, 'a CR may only be created in DRAFT').toBe(false)
    expect(res.error).toMatch(/can only be created in DRAFT|QMSCR/i)
  })

  test('non-lifecycle column writes are still allowed for app_user', async ({ page }) => {
    test.setTimeout(120_000)
    const title = uniqueTitle('J7-benign')
    await createCr(page, title)
    const cr = findCrByTitle(title)

    // The guard must ignore updates that don't touch status_id, otherwise every
    // ordinary inline field save through the syncEngine would break.
    const res = sqlAsAppUser(
      `UPDATE change_requests SET business_justification = 'E2E benign edit' WHERE id = '${cr.id}';`,
      asAuthor,
    )
    expect(res.ok, res.error).toBe(true)
    expect(
      sqlValue(`SELECT business_justification FROM change_requests WHERE id = '${cr.id}'`),
    ).toBe('E2E benign edit')
  })

  test('step IDOR: a foreign workflowInstanceStepId is rejected', async ({ page }) => {
    test.setTimeout(150_000)
    // Two CRs — try to drive CR-A's endpoint with CR-B's step id.
    const titleA = uniqueTitle('J7-idor-a')
    await createCr(page, titleA)
    const crA = findCrByTitle(titleA)
    await assignDraftReviewers(page, crA.id)
    await submitCrForApproval(page, crA.id)

    const titleB = uniqueTitle('J7-idor-b')
    await createCr(page, titleB)
    const crB = findCrByTitle(titleB)
    await assignDraftReviewers(page, crB.id)
    await submitCrForApproval(page, crB.id)

    const foreignStepId = stepIdByName(crB.id, 'Impact Review')
    expect(foreignStepId).toBeTruthy()

    const res = await page.request.post(`/api/v1/services/changeRequests/${crA.id}/cancelStep`, {
      data: { workflowInstanceStepId: foreignStepId },
    })
    expect(res.status(), "a step from another CR's instance must not be actionable").toBe(400)

    // CR-B's step is untouched.
    expect(
      sqlValue(`SELECT status_id FROM workflow_instance_steps WHERE id = '${foreignStepId}'`),
    ).not.toBe('CANCELLED')
  })

  test('step IDOR: a nonexistent workflowInstanceStepId is rejected', async ({ page }) => {
    test.setTimeout(120_000)
    const title = uniqueTitle('J7-idor-missing')
    await createCr(page, title)
    const cr = findCrByTitle(title)
    await assignDraftReviewers(page, cr.id)
    await submitCrForApproval(page, cr.id)

    const res = await page.request.post(`/api/v1/services/changeRequests/${cr.id}/cancelStep`, {
      data: { workflowInstanceStepId: '00000000-0000-4000-8000-000000000000' },
    })
    expect(res.status()).toBe(400)
  })

  // ── addChildStep had its OWN, unguarded step lookup (fixed 2026-09-08) ─────
  //
  // The two probes above drive /cancelStep, whose guard lives in the SHARED
  // service (workflowStepActionsService.executeCancelStep binds the step to the
  // resource's own workflow_instance first). addChildStep does not go through
  // that service: it had its own lookup,
  //   db.WorkflowInstanceStep.findOne({ where: { id: parentInstanceStepId } })
  // with no company filter and no binding to the CR in the URL. The child step
  // is then created with `workflowInstanceId: parent.workflowInstanceId`, so a
  // guessed foreign id inserted a step into ANOTHER record's workflow —
  // another CR's, a CAPA's, an audit's — stamped with the caller's company_id,
  // with a user assigned to it. The module's step-IDOR coverage looked complete
  // and never touched this endpoint.
  test('step IDOR: addChildStep refuses a parent step from another CR’s workflow', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000)

    // CR-A, driven to Implementation so it has a legitimate child-step parent.
    const titleA = uniqueTitle('J7-child-a')
    await createCr(page, titleA)
    const crA = findCrByTitle(titleA)
    await assignDraftReviewers(page, crA.id)
    await submitCrForApproval(page, crA.id)
    await completeReviewerStep(browser, crA.id)
    await completeApproverStep(browser, crA.id)
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'ChangeRequest' AND entity_id = '${crA.id}'
          AND assigned_to = '${USERS.author.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 45_000, label: 'CR-A implementation task assigned' },
    )
    const parentA = stepIdByName(crA.id, 'Implementation')
    expect(parentA, 'CR-A has an Implementation step').toBeTruthy()

    // CR-B — a second record whose steps CR-A's owner must not reach.
    const titleB = uniqueTitle('J7-child-b')
    await createCr(page, titleB)
    const crB = findCrByTitle(titleB)
    await assignDraftReviewers(page, crB.id)
    await submitCrForApproval(page, crB.id)
    const foreignStep = stepIdByName(crB.id, 'Impact Review')
    expect(foreignStep).toBeTruthy()

    const before = sqlValue(
      `SELECT count(*) FROM workflow_instance_steps WHERE parent_instance_step_id = '${foreignStep}'`,
    )

    const res = await page.request.post(`/api/v1/services/changeRequests/${crA.id}/addChildStep`, {
      data: {
        parentInstanceStepId: foreignStep,
        name: 'E2E IDOR sub-task — must never be created',
        assigneeUserId: USERS.author.id,
      },
    })
    expect(res.status(), "a step from another CR's workflow is not a valid parent").toBe(400)

    // CR-B's workflow is untouched — no orphan child was grafted onto it.
    expect(
      sqlValue(
        `SELECT count(*) FROM workflow_instance_steps WHERE parent_instance_step_id = '${foreignStep}'`,
      ),
      'no child step was created under the foreign parent',
    ).toBe(before)

    // CONTROL — CR-A's OWN Implementation step is still a valid parent, so the
    // guard is refusing the foreign record and not the endpoint.
    const ok = await page.request.post(`/api/v1/services/changeRequests/${crA.id}/addChildStep`, {
      data: {
        parentInstanceStepId: parentA,
        name: 'E2E control sub-task',
        assigneeUserId: USERS.author.id,
      },
    })
    expect(ok.ok(), await ok.text()).toBeTruthy()
  })

  test('addChildStep refuses an assignee from another tenant', async ({ page, browser }) => {
    test.setTimeout(300_000)
    // `assigneeUserId` was validated as `z.string().uuid()` — format, not
    // tenancy — and landed in a single-column FK to users(id). A foreign user
    // was therefore assignable, and send_task_assigned_notification.js resolves
    // its recipient with `JOIN users u ON u.id = ti.assigned_to` and no company
    // filter, so they would have been emailed this company's CR number, title
    // and a link. Same bug class the Audits pass closed on 2026-09-08.
    const title = uniqueTitle('J7-child-tenant')
    await createCr(page, title)
    const cr = findCrByTitle(title)
    await assignDraftReviewers(page, cr.id)
    await submitCrForApproval(page, cr.id)
    await completeReviewerStep(browser, cr.id)
    await completeApproverStep(browser, cr.id)
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'ChangeRequest' AND entity_id = '${cr.id}'
          AND assigned_to = '${USERS.author.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 45_000, label: 'implementation task assigned' },
    )
    const parentStepId = stepIdByName(cr.id, 'Implementation')

    const res = await page.request.post(`/api/v1/services/changeRequests/${cr.id}/addChildStep`, {
      data: {
        parentInstanceStepId: parentStepId,
        name: 'E2E cross-tenant assignee',
        assigneeUserId: ALT_USERS.owner.id,
      },
    })
    expect(res.status(), 'a user in another company is not assignable').toBe(400)

    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM users_on_workflow_instance_steps WHERE user_id = '${ALT_USERS.owner.id}'`,
        ),
      ),
      'no assignment row was written for the foreign user',
    ).toBe(0)
  })
})
