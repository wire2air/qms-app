// PW-J7 · step IDOR + status-transition bypass (P0, security).
//
// The authoritative CRUD write path for `change_requests` is PostGraphile
// auto-CRUD running as DB role `app_user`. RLS gates the ROW (company +
// change_control permission) but never inspects the NEW VALUE, so any guard
// living only in the REST controller is bypassable by a raw mutation. CR-C1
// closes that with the `enforce_cr_status_transition` trigger (ERRCODE QMSCR);
// these tests drive the real untrusted role to prove it.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, COMPANY_ID } from '../fixtures/cast.js'
import {
  createCr,
  assignDraftReviewers,
  submitCrForApproval,
  stepIdByName,
  uniqueTitle,
} from '../fixtures/changeRequests.js'
import { findCrByTitle, sqlValue, sqlAsAppUser } from '../fixtures/db.js'

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
})
