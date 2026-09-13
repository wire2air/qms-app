// PW-J2 · cancel with e-signature (P0).
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import {
  createCr,
  assignDraftReviewers,
  submitCrForApproval,
  cancelCr,
  uniqueTitle,
} from '../fixtures/changeRequests.js'
import { findCrByTitle, sqlValue, sqlRow, waitForSqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

test.describe('PW-J2 · cancel an OPEN CR', () => {
  test('owner cancels — workflow aborted, e-signed, reason recorded', async ({ page }) => {
    test.setTimeout(120_000)
    const title = uniqueTitle('J2')
    await createCr(page, title)
    const cr = findCrByTitle(title)
    await assignDraftReviewers(page, cr.id)
    await submitCrForApproval(page, cr.id)

    const wfInstanceId = sqlValue(
      `SELECT id FROM workflow_instances WHERE resource_type = 'ChangeRequest' AND resource_id = '${cr.id}' AND status_id = 'IN_PROGRESS'`,
    )
    expect(wfInstanceId, 'workflow is IN_PROGRESS before cancel').toBeTruthy()

    await page.goto(`/change-requests/${cr.id}`)
    await cancelCr(page, { reason: 'E2E cancel — superseded by a broader change.' })

    await waitForSqlValue(
      `SELECT count(*) FROM change_requests WHERE id = '${cr.id}' AND status_id = 'CANCELLED'`,
      { timeoutMs: 30_000, label: 'CR CANCELLED' },
    )

    const row = sqlRow(
      `SELECT cancel_reason, cancelled_at IS NOT NULL, cancelled_by FROM change_requests WHERE id = '${cr.id}'`,
    )
    expect(row[0]).toContain('superseded')
    expect(row[1], 'cancelled_at stamped').toBe('t')
    expect(row[2], 'cancelled_by attributed').toBeTruthy()

    // The in-progress workflow instance is aborted, not left dangling.
    expect(
      sqlValue(`SELECT status_id FROM workflow_instances WHERE id = '${wfInstanceId}'`),
      'workflow instance no longer IN_PROGRESS',
    ).not.toBe('IN_PROGRESS')

    // CR-H2 — Part-11 ledger row for the cancellation, keyed on the CR subject.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM signatures WHERE change_request_id = '${cr.id}' AND meaning = 'CANCELLED'`,
        ),
      ),
      'exactly one CANCELLED signature for this CR',
    ).toBe(1)

    // Attributed CANCEL audit row.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM audit_logs
            WHERE entity_type = 'ChangeRequest' AND entity_id = '${cr.id}'
              AND action = 'CANCEL' AND performed_by IS NOT NULL`,
        ),
      ),
      'attributed CANCEL audit row exists',
    ).toBeGreaterThan(0)

    // Terminal — the action bar no longer offers Cancel or Close.
    await page.goto(`/change-requests/${cr.id}`)
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0)
  })

  test('negative: cancelling an already-CANCELLED CR is rejected 409', async ({ page }) => {
    test.setTimeout(120_000)
    const title = uniqueTitle('J2-recancel')
    await createCr(page, title)
    const cr = findCrByTitle(title)
    await assignDraftReviewers(page, cr.id)
    await submitCrForApproval(page, cr.id)

    const firstCancel = await page.request.post(`/api/v1/services/changeRequests/${cr.id}/cancel`, {
      data: { reason: 'E2E setup cancel', method: 'PIN', token: '12345678', provider: null },
    })
    expect(firstCancel.ok()).toBeTruthy()

    const res = await page.request.post(`/api/v1/services/changeRequests/${cr.id}/cancel`, {
      data: { reason: 'should be rejected', method: 'PIN', token: '12345678', provider: null },
    })
    expect(res.status()).toBe(409)
    const body = await res.json().catch(() => null)
    expect(body?.error?.message ?? '').toMatch(/already in terminal state/i)
  })

  test('negative: cancel without a reason is rejected 400', async ({ page }) => {
    test.setTimeout(120_000)
    const title = uniqueTitle('J2-noreason')
    await createCr(page, title)
    const cr = findCrByTitle(title)
    await assignDraftReviewers(page, cr.id)
    await submitCrForApproval(page, cr.id)

    const res = await page.request.post(`/api/v1/services/changeRequests/${cr.id}/cancel`, {
      data: { reason: '   ', method: 'PIN', token: '12345678', provider: null },
    })
    expect(res.status()).toBe(400)

    // The CR is untouched — a rejected cancel must not half-apply.
    expect(sqlValue(`SELECT status_id FROM change_requests WHERE id = '${cr.id}'`)).toBe('OPEN')
  })

  // DRAFT → CANCELLED — the one edge of the six in enforce_cr_status_transition
  // that had no end-to-end coverage. The integration trigger suite
  // (tests/integration/changeRequests/cr-status-transition-guard.test.js)
  // exercises all six at the DB, and J2 above covers OPEN → CANCELLED through
  // the UI, but abandoning a change BEFORE it is ever opened — the ordinary
  // "we changed our mind" path — was only ever proved in SQL.
  //
  // Driven through the REST endpoint rather than the action bar, like the two
  // negative cases above: the claim under test is the controller + trigger +
  // ledger, and a button-visibility question would make the assertion about
  // something else.
  test('a DRAFT CR can be cancelled — e-signed, and it burns no CR number', async ({ page }) => {
    test.setTimeout(120_000)
    const title = uniqueTitle('J2-draftcancel')
    await createCr(page, title)
    const cr = findCrByTitle(title)
    expect(cr.statusId, 'not submitted — still a draft').toBe('DRAFT')

    // Numbers are minted at submit (2026-08-28), precisely so an abandoned
    // draft leaves no gap in the register. Pin both halves of that rule.
    expect(
      sqlValue(`SELECT cr_number IS NULL FROM change_requests WHERE id = '${cr.id}'`),
      'a draft carries no CR number yet',
    ).toBe('t')

    const res = await page.request.post(`/api/v1/services/changeRequests/${cr.id}/cancel`, {
      data: {
        reason: 'E2E draft cancel — requirement withdrawn before review.',
        method: 'PIN',
        token: '12345678',
        provider: null,
      },
    })
    expect(res.ok(), await res.text()).toBeTruthy()

    await waitForSqlValue(
      `SELECT count(*) FROM change_requests WHERE id = '${cr.id}' AND status_id = 'CANCELLED'`,
      { timeoutMs: 30_000, label: 'DRAFT CR CANCELLED' },
    )

    const row = sqlRow(
      `SELECT cancel_reason, cancelled_at IS NOT NULL, cancelled_by, cr_number IS NULL
         FROM change_requests WHERE id = '${cr.id}'`,
    )
    expect(row[0]).toContain('withdrawn before review')
    expect(row[1], 'cancelled_at stamped').toBe('t')
    expect(row[2], 'cancelled_by attributed').toBeTruthy()
    expect(row[3], 'a cancelled draft still burns no number — the register has no gap').toBe('t')

    // Part-11 ledger row, keyed on the CR subject, exactly as the OPEN path.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM signatures WHERE change_request_id = '${cr.id}' AND meaning = 'CANCELLED'`,
        ),
      ),
      'exactly one CANCELLED signature for this draft',
    ).toBe(1)

    // Attributed CANCEL audit row.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM audit_logs
            WHERE entity_type = 'ChangeRequest' AND entity_id = '${cr.id}'
              AND action = 'CANCEL' AND performed_by IS NOT NULL`,
        ),
      ),
      'attributed CANCEL audit row exists',
    ).toBeGreaterThan(0)

    // A cancelled draft never had a workflow, so nothing should have been made
    // for it — the cancel path must not spawn one on its way out.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM workflow_instances
            WHERE resource_type = 'ChangeRequest' AND resource_id = '${cr.id}'`,
        ),
      ),
      'no workflow instance is created by cancelling a draft',
    ).toBe(0)

    // Terminal: CANCELLED leaves no outgoing edge, so re-cancelling is 409.
    const again = await page.request.post(`/api/v1/services/changeRequests/${cr.id}/cancel`, {
      data: { reason: 'again', method: 'PIN', token: '12345678', provider: null },
    })
    expect(again.status()).toBe(409)
  })
})
