// SMK-009 · a reviewer finds their task in the inbox and completes it from there.
//
// The approval engine end to end, entered the way a user enters it: a Change
// Request is created and submitted, the step-1 task lands in the reviewer's "My
// Tasks" inbox, the reviewer opens it FROM THE INBOX and completes it, and the
// engine advances to step 2.
//
// ── WHAT THE UI ACTUALLY OFFERS (measured from the source, not assumed) ─────────
// There is no approve button in the inbox itself and no task page: every inbox
// row is a link to its HOST record (src/utils/taskRoute.js — ChangeRequest →
// /change-requests/:id; `/task-instances/:id` does not exist). So "approve from
// the inbox" is: inbox row → CR detail → the step's action. The seeded CR workflow
// (FIXTURES.crWorkflowName "E2E CR Review & Approval"; see fixtures/changeRequests.js) is
//   step 1  Impact Review    ACTION   E2E Reviewer   no e-sign  → "Mark Complete"
//   step 2  Change Approval  APPROVAL E2E Approver   e-sign PIN → "Approve" + PIN
//   step 3  Implementation   ACTION   E2E Author
// The reviewer's step is an ACTION step, so the control is "Mark Complete" (no
// PIN dialog). Completing it is recorded exactly like an approval: the task goes
// to status APPROVED and the worker writes an audit_logs row with action APPROVE
// (both measured on app-db across 89 completed CR tasks).
//
// Setup reuses the proven CR fixtures, which drive the UI (there is no REST
// shortcut in the fixtures for a CR with pending reviewers; POST
// /v1/services/changeRequests exists but the reviewer picks live on the draft
// preview, which is what assignDraftReviewers drives).
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import { findCrByTitle, sqlValue, sqlRow, waitForSqlValue } from '../fixtures/db.js'
import {
  createCr,
  assignDraftReviewers,
  submitCrForApproval,
  uniqueTitle,
} from '../fixtures/changeRequests.js'
import { clickWhenReady } from '../fixtures/documents.js'
import { gotoInbox, inboxRow, inboxSearch } from '../fixtures/tasks.js'
import { sqlQuote as q } from '../fixtures/smoke.js'

test.describe('SMK-009 · inbox → complete → next step', () => {
  test(
    'reviewer completes a CR task opened from My Tasks; step 2 is assigned and audited',
    { tag: ['@smoke', '@p0'] },
    async ({ browser }) => {
      test.setTimeout(300_000)
      const title = uniqueTitle('SMK-inbox')

      // ── Author: create + assign reviewers + open (submit) ──
      const authorCtx = await browser.newContext({ storageState: AUTH.author })
      let crId
      try {
        const authorPage = await authorCtx.newPage()
        await createCr(authorPage, title)
        crId = findCrByTitle(title)?.id
        expect(crId, 'CR persisted').toBeTruthy()
        await assignDraftReviewers(authorPage, crId)
        await submitCrForApproval(authorPage, crId)
      } finally {
        await authorCtx.close()
      }
      expect(
        sqlValue(`SELECT status_id FROM change_requests WHERE id = ${q(crId)}`),
        'CR is OPEN',
      ).toBe('OPEN')

      const taskId = await waitForSqlValue(
        `SELECT id FROM task_instances
        WHERE entity_type = 'ChangeRequest' AND entity_id = ${q(crId)}
          AND assigned_to = ${q(USERS.reviewer.id)} AND status_id = 'ASSIGNED'
        LIMIT 1`,
        { timeoutMs: 45_000, label: 'step-1 task assigned to the reviewer' },
      )
      const since = sqlValue('SELECT now()::text')

      // ── Reviewer: inbox → row → CR → Mark Complete ──
      const reviewerCtx = await browser.newContext({ storageState: AUTH.reviewer })
      try {
        const page = await reviewerCtx.newPage()
        await gotoInbox(page)
        // Narrow the list so the row is not paged away behind older ASSIGNED tasks.
        await inboxSearch(page).fill(title)
        const row = inboxRow(page, title).first()
        await expect(row, 'the task is in the reviewer’s inbox').toBeVisible({ timeout: 90_000 })
        expect(await row.getAttribute('href'), 'inbox row deep-links to the CR').toBe(
          `/change-requests/${crId}`,
        )
        await row.click()
        await expect(page).toHaveURL(new RegExp(`/change-requests/${crId}`), { timeout: 45_000 })

        await clickWhenReady(page, page.getByRole('button', { name: 'Mark Complete' }))

        // Barrier before closing the context — the in-flight POST dies with it.
        await waitForSqlValue(
          `SELECT count(*) FROM task_instances WHERE id = ${q(taskId)} AND status_id <> 'ASSIGNED'`,
          { timeoutMs: 30_000, label: 'reviewer task left ASSIGNED' },
        )
      } finally {
        await reviewerCtx.close()
      }

      // ── Persisted state ──
      // (task_instances has no completed_by column — the actor is proven by the
      // audit row's performed_by below.)
      const [status, completed] =
        sqlRow(
          `SELECT status_id, (completed_at IS NOT NULL)::text FROM task_instances WHERE id = ${q(taskId)}`,
        ) ?? []
      expect(status, 'the completed ACTION task is recorded APPROVED').toBe('APPROVED')
      expect(completed, 'completed_at stamped').toBe('true')

      // Next step: the engine advanced and assigned step 2 to the approver.
      await waitForSqlValue(
        `SELECT count(*) FROM task_instances
        WHERE entity_type = 'ChangeRequest' AND entity_id = ${q(crId)}
          AND assigned_to = ${q(USERS.approver.id)} AND status_id = 'ASSIGNED'`,
        { timeoutMs: 45_000, label: 'step-2 task assigned to the approver' },
      )

      // Audit: the worker wrote the completion, attributed to the reviewer.
      await waitForSqlValue(
        `SELECT id FROM audit_logs
        WHERE entity_type = 'TaskInstances' AND entity_id = ${q(taskId)}
          AND action = 'APPROVE' AND performed_by = ${q(USERS.reviewer.id)}
          AND created_at > ${q(since)}
        LIMIT 1`,
        { timeoutMs: 60_000, label: 'APPROVE audit row for the reviewer task' },
      )
      // And the CR is still OPEN (steps 2/3 remain) — nothing closed it early.
      expect(sqlValue(`SELECT status_id FROM change_requests WHERE id = ${q(crId)}`)).toBe('OPEN')
    },
  )
})
