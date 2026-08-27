// PW-J1 · create → submit → approve → close with e-sign (P0).
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import {
  createCr,
  assignDraftReviewers,
  submitCrForApproval,
  completeReviewerStep,
  completeApproverStep,
  completeImplementationStep,
  closeCr,
  expectCloseRejected,
  uniqueTitle,
} from '../fixtures/changeRequests.js'
import { findCrByTitle, sqlValue, waitForSqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J1 · the full CR lifecycle', () => {
  test('create CR (DRAFT) → Submit for Approval (OPEN), workflow instantiated', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const title = uniqueTitle('J1-submit')
    await createCr(page, title)

    const cr = findCrByTitle(title)
    expect(cr, 'CR row exists').toBeTruthy()
    expect(cr.statusId).toBe('DRAFT')
    // Flat per-company numbering (site/dept prefixes dropped).
    expect(cr.crNumber, 'CR number minted on create').toMatch(/^CR-\d{3,}$/)

    await assignDraftReviewers(page, cr.id)
    await submitCrForApproval(page, cr.id)

    // Unified statuses (2026-08-26): submit lands the CR at OPEN.
    expect(sqlValue(`SELECT status_id FROM change_requests WHERE id = '${cr.id}'`)).toBe(
      'OPEN',
    )
    expect(
      sqlValue(`SELECT submitted_at IS NOT NULL FROM change_requests WHERE id = '${cr.id}'`),
    ).toBe('t')
    // pendingReviewers is consumed by submit, not left dangling.
    expect(
      sqlValue(
        `SELECT count(*) FROM jsonb_object_keys(
           (SELECT pending_reviewers FROM change_requests WHERE id = '${cr.id}'))`,
      ),
    ).toBe('0')

    const wfInstanceId = sqlValue(
      `SELECT id FROM workflow_instances WHERE resource_type = 'ChangeRequest' AND resource_id = '${cr.id}' AND status_id = 'IN_PROGRESS'`,
    )
    expect(wfInstanceId, 'one IN_PROGRESS workflow instance').toBeTruthy()

    // All three seeded root steps were instantiated.
    expect(
      sqlValue(
        `SELECT count(*) FROM workflow_instance_steps WHERE workflow_instance_id = '${wfInstanceId}' AND parent_instance_step_id IS NULL`,
      ),
    ).toBe('3')
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'ChangeRequest' AND entity_id = '${cr.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 30_000, label: 'first step task assigned' },
    )
  })

  test('reviewer → approver → implementation completes the workflow, CR stays OPEN', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000)
    const title = uniqueTitle('J1-approve')
    await createCr(page, title)
    const cr = findCrByTitle(title)
    await assignDraftReviewers(page, cr.id)
    await submitCrForApproval(page, cr.id)

    // Gate: while workflow steps are open the CR cannot be closed — the
    // all-tasks rule (the phase statuses are gone; the workflow is the gate).
    await expectCloseRejected(page, cr.id, /workflow step.*still open/i)

    await completeReviewerStep(browser, cr.id)
    await completeApproverStep(browser, cr.id)
    await completeImplementationStep(page, cr.id)

    // Last root step done → instance COMPLETED → handler stamps approvedAt;
    // the CR STAYS OPEN (phases live on the workflow now).
    await waitForSqlValue(
      `SELECT count(*) FROM change_requests
        WHERE id = '${cr.id}' AND status_id = 'OPEN' AND approved_at IS NOT NULL`,
      { timeoutMs: 45_000, label: 'workflow finished, CR still OPEN' },
    )
    expect(
      sqlValue(`SELECT approved_at IS NOT NULL FROM change_requests WHERE id = '${cr.id}'`),
    ).toBe('t')
    expect(
      sqlValue(
        `SELECT status_id FROM workflow_instances WHERE resource_type = 'ChangeRequest' AND resource_id = '${cr.id}'`,
      ),
    ).toBe('COMPLETED')

    // onComplete also assigns the owner a REVIEW task ("ready for review and close").
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM task_instances
            WHERE entity_type = 'ChangeRequest' AND entity_id = '${cr.id}'
              AND task_kind_id = 'REVIEW' AND assigned_to = '${cr.ownerId}'`,
        ),
      ),
      'owner gets a REVIEW task on approval',
    ).toBeGreaterThan(0)
  })

  test('owner closes a finished OPEN CR with e-signature → CLOSED + Part-11 ledger row', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000)
    const title = uniqueTitle('J1-close')
    await createCr(page, title)
    const cr = findCrByTitle(title)
    await assignDraftReviewers(page, cr.id)
    await submitCrForApproval(page, cr.id)
    await completeReviewerStep(browser, cr.id)
    await completeApproverStep(browser, cr.id)
    await completeImplementationStep(page, cr.id)
    await waitForSqlValue(
      `SELECT count(*) FROM change_requests
        WHERE id = '${cr.id}' AND status_id = 'OPEN' AND approved_at IS NOT NULL`,
      { timeoutMs: 45_000, label: 'workflow finished, CR still OPEN' },
    )

    await page.goto(`/change-requests/${cr.id}`)
    await closeCr(page, { comments: 'E2E close — change implemented and verified.' })

    await waitForSqlValue(
      `SELECT count(*) FROM change_requests WHERE id = '${cr.id}' AND status_id = 'CLOSED'`,
      { timeoutMs: 30_000, label: 'CR CLOSED' },
    )
    expect(sqlValue(`SELECT closed_at IS NOT NULL FROM change_requests WHERE id = '${cr.id}'`)).toBe(
      't',
    )

    // CR-H2: the signature that legally closes the CR is manifested in the
    // immutable Part-11 ledger, keyed on the CR subject.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM signatures WHERE change_request_id = '${cr.id}' AND meaning = 'CLOSED'`,
        ),
      ),
      'exactly one CLOSED signature for this CR',
    ).toBe(1)

    // Attributed CLOSE audit row (CR-H1 — applyAuditSessionVars runs first).
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM audit_logs
            WHERE entity_type = 'ChangeRequest' AND entity_id = '${cr.id}'
              AND action = 'CLOSE' AND performed_by IS NOT NULL`,
        ),
      ),
      'attributed CLOSE audit row exists',
    ).toBeGreaterThan(0)

    // Terminal — Close/Cancel are gone from the action bar.
    await page.goto(`/change-requests/${cr.id}`)
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
  })

  test('negative: closing an already-CLOSED CR is rejected 409', async ({ page, browser }) => {
    test.setTimeout(180_000)
    const title = uniqueTitle('J1-reclose')
    await createCr(page, title)
    const cr = findCrByTitle(title)
    await assignDraftReviewers(page, cr.id)
    await submitCrForApproval(page, cr.id)
    await completeReviewerStep(browser, cr.id)
    await completeApproverStep(browser, cr.id)
    await completeImplementationStep(page, cr.id)
    await waitForSqlValue(
      `SELECT count(*) FROM change_requests
        WHERE id = '${cr.id}' AND status_id = 'OPEN' AND approved_at IS NOT NULL`,
      { timeoutMs: 45_000, label: 'workflow finished, CR still OPEN' },
    )

    const closeRes = await page.request.post(`/api/v1/services/changeRequests/${cr.id}/close`, {
      data: { comments: 'E2E setup close', method: 'PIN', token: '12345678', provider: null },
    })
    expect(closeRes.ok()).toBeTruthy()

    await expectCloseRejected(page, cr.id, /already closed/i)
  })
})
