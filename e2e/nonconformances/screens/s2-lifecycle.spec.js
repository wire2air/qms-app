// NCR screenshots · S2 — the record lifecycle.
//   Create form (blank → filled → "Assign Step Reviewers"), the DRAFT detail,
//   the Open-NC confirm, the UNDER_REVIEW record, the close-blocked action bar
//   with its gate reason, the Disposition card once filled, the Approve & Close
//   dialog + e-signature, and the CLOSED record. Details / Workflow /
//   Disposition are anchor-nav sections, so one full-page capture carries them.
// Gate order and selectors mirror PW-J1 / PW-J3.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, ESIGN_PIN, FIXTURES, USERS } from '../../fixtures/cast.js'
import {
  raiseNc,
  completeReviewerStep,
  completeApproverStep,
  fillDisposition,
  uniqueTitle,
} from '../../fixtures/nonconformances.js'
import { findNcByTitle, waitForSqlValue } from '../../fixtures/db.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('nonconformances')

test.describe('NCR screenshots · raise → review → disposition → e-signed close', () => {
  test('full lifecycle with every gate state captured', async ({ browser }) => {
    test.setTimeout(700_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()

    // ── Create wizard, screen 1 — the workflow choice (2026-08-10: the
    //    create flow is workflow-first; the details form is screen 2 and is
    //    captured by the beforeSubmit hook below). ─────────────────────────
    await page.goto('/nonconformances/create')
    await expect(page.getByText('Select a workflow', { exact: true })).toBeVisible({
      timeout: 45_000,
    })
    await shot(page, 'create')

    // ── Filled form + the reviewer-assignment dialog ───────────────────────
    const title = uniqueTitle('S2-lifecycle')
    await raiseNc(page, title, {
      severity: 'Major',
      async beforeSubmit(p) {
        await shot(p, 'create-filled')
      },
      async onReviewerDialog(p) {
        await expect(
          p.getByText('Assign task to user for each workflow step before submitting.'),
        ).toBeVisible()
        await shot(p, 'create-assign-reviewers-dialog')
      },
    })
    const nc = findNcByTitle(title)

    // Create-and-open (2026-08-10): raiseNc lands on the record already
    // UNDER_REVIEW — the DRAFT detail and the Open-NC confirm no longer
    // exist on this path (drafts remain only for QC-lot spawns).
    await waitForSqlValue(
      `SELECT status_id FROM nonconformances WHERE id = '${nc.id}' AND status_id = 'UNDER_REVIEW'`,
      { timeoutMs: 45_000, label: 'NC UNDER_REVIEW' },
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'Approve & Close' })).toBeVisible({
      timeout: 30_000,
    })
    await shot(page, 'detail-under-review')

    // Gate 1 — workflow steps still open (reason lives in the title attribute).
    await expect(page.getByRole('button', { name: 'Approve & Close' })).toHaveAttribute(
      'title',
      /workflow step.*still open/i,
      { timeout: 20_000 },
    )
    await shot(page, 'detail-close-blocked-steps')

    // ── Both workflow steps completed ──────────────────────────────────────
    await completeReviewerStep(browser, nc.id)
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Nonconformance' AND entity_id = '${nc.id}'
          AND assigned_to = '${USERS.approver.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 45_000, label: 'approver task created' },
    )
    await completeApproverStep(browser, nc.id)
    await waitForSqlValue(
      `SELECT count(*) FROM workflow_instances
        WHERE resource_type = 'Nonconformance' AND resource_id = '${nc.id}'
          AND status_id != 'IN_PROGRESS'`,
      { timeoutMs: 45_000, label: 'workflow finished' },
    )
    await page.reload({ waitUntil: 'domcontentloaded' })

    // Gate 2 — disposition still missing.
    await expect(page.getByRole('button', { name: 'Approve & Close' })).toHaveAttribute(
      'title',
      /disposition/i,
      { timeout: 30_000 },
    )
    await shot(page, 'detail-close-blocked-disposition')

    // ── Disposition card (inline autosave) ─────────────────────────────────
    // ncrDispositionCost tracks cost, so the cost gate is exercised too.
    await fillDisposition(page, nc.id, { disposition: FIXTURES.ncrDispositionCost })
    await fillDisposition(page, nc.id, {
      notes: 'Screenshot run — reworked per SOP-9 and retested OK.',
    })
    await fillDisposition(page, nc.id, { capaRequired: false })
    await fillDisposition(page, nc.id, { costOfNc: 275.5 })
    await expect(page.getByRole('button', { name: 'Approve & Close' })).toBeEnabled({
      timeout: 30_000,
    })
    await shot(page, 'detail-disposition-filled')

    // ── Approve & Close dialog → e-signature → CLOSED ──────────────────────
    await page.getByRole('button', { name: 'Approve & Close' }).click()
    await expect(page.getByText('Approve and Close', { exact: true })).toBeVisible({
      timeout: 15_000,
    })
    await page.getByRole('textbox').last().fill('Screenshot run — all gates satisfied.')
    await shot(page, 'approve-close-dialog')

    await page.getByRole('button', { name: 'Sign & Close' }).click()
    const pin = page.getByPlaceholder('Enter your e-signature PIN')
    await expect(pin).toBeVisible({ timeout: 15_000 })
    await shot(page, 'close-esign-dialog')

    const signBtn = page.getByRole('button', { name: 'Sign', exact: true })
    await expect(async () => {
      await pin.fill(ESIGN_PIN)
      await expect(signBtn).toBeEnabled({ timeout: 3_000 })
    }).toPass({ timeout: 20_000 })
    await signBtn.click()

    await waitForSqlValue(
      `SELECT status_id FROM nonconformances WHERE id = '${nc.id}' AND status_id = 'CLOSED'`,
      { timeoutMs: 60_000, label: 'NC CLOSED' },
    )
    await expect(async () => {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByText(/closed/i).first()).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 45_000 })
    await shot(page, 'detail-closed')

    await ctx.close()
  })
})
