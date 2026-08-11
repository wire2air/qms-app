// CAPA screenshots · S2 — the record lifecycle.
//   Create form (blank → filled → the "Assign Step Reviewers" dialog), the
//   DRAFT detail, the Open-CAPA confirm, the PENDING record (Details /
//   Workflow / Effectiveness are anchor-nav sections, so one full-page capture
//   carries them), the close-blocked action bar, the e-signed Close dialog, the
//   CLOSED record, the Audit Log dialog, and — on a second CAPA — the e-signed
//   Cancel dialog.
// Flow mirrors PW-J1 / PW-J3 / PW-J5.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, ESIGN_PIN, USERS } from '../../fixtures/cast.js'
import {
  createCapa,
  openCapa,
  completeReviewerStep,
  completeApproverStep,
  uniqueTitle,
} from '../../fixtures/capas.js'
import { findCapaByTitle, waitForSqlValue } from '../../fixtures/db.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('capas')

test.describe.serial('CAPA screenshots · create → open → close / cancel', () => {
  test('create form, draft, open, workflow, close with e-signature', async ({ browser }) => {
    test.setTimeout(600_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()

    // ── Blank create form ──────────────────────────────────────────────────
    await page.goto('/capas/create')
    await expect(page.getByPlaceholder('Describe the CAPA…')).toBeVisible({ timeout: 20_000 })
    await shot(page, 'create')

    // ── Filled form + the reviewer-assignment dialog ───────────────────────
    const title = uniqueTitle('S2-lifecycle')
    await createCapa(page, title, {
      priority: 'High',
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
    const capa = findCapaByTitle(title)

    // ── DRAFT detail (Details + Workflow + Effectiveness sections) ─────────
    await expect(page.getByText(capa.capaNumber).first()).toBeVisible({ timeout: 20_000 })
    await shot(page, 'detail-draft')

    // ── Open CAPA confirm dialog ───────────────────────────────────────────
    await page.getByRole('button', { name: 'Open CAPA' }).click()
    await expect(page.getByText('Opening this CAPA starts the assigned workflow')).toBeVisible({
      timeout: 15_000,
    })
    await shot(page, 'open-capa-confirm')
    await page.getByRole('button', { name: 'Open CAPA' }).last().click()

    await waitForSqlValue(`SELECT status_id FROM capas WHERE id = '${capa.id}' AND status_id = 'PENDING'`, {
      timeoutMs: 45_000,
      label: 'CAPA PENDING',
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'Close CAPA' })).toBeVisible({ timeout: 30_000 })
    await shot(page, 'detail-pending')

    // Close is gated while workflow steps are open — the button carries the
    // reason in its title attribute (PW-J3).
    await expect(page.getByRole('button', { name: 'Close CAPA' })).toHaveAttribute(
      'title',
      /workflow step.*still open/i,
      { timeout: 20_000 },
    )
    await shot(page, 'detail-close-blocked')

    // ── Audit Log dialog (overflow action) ─────────────────────────────────
    await page.getByRole('button', { name: /more actions/i }).click()
    await expect(page.getByRole('menuitem', { name: /audit log/i })).toBeVisible({ timeout: 10_000 })
    await shot(page, 'detail-more-actions-menu')
    await page.getByRole('menuitem', { name: /audit log/i }).click()
    await expect(page.getByText(/audit log/i).first()).toBeVisible({ timeout: 15_000 })
    await shot(page, 'detail-audit-log')
    await page.keyboard.press('Escape')

    // ── Both workflow steps completed (reviewer, then e-signing approver) ──
    await completeReviewerStep(browser, capa.id)
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'Capa' AND entity_id = '${capa.id}'
          AND assigned_to = '${USERS.approver.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 45_000, label: 'approver task created' },
    )
    await completeApproverStep(browser, capa.id)
    await waitForSqlValue(
      `SELECT count(*) FROM workflow_instances
        WHERE resource_type = 'Capa' AND resource_id = '${capa.id}' AND status_id != 'IN_PROGRESS'`,
      { timeoutMs: 45_000, label: 'workflow finished' },
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'Close CAPA' })).toBeEnabled({ timeout: 30_000 })
    await shot(page, 'detail-workflow-complete')

    // ── Close dialog → e-signature → CLOSED ────────────────────────────────
    await page.getByRole('button', { name: 'Close CAPA' }).click()
    await expect(page.getByRole('heading', { name: 'Close CAPA' })).toBeVisible({ timeout: 15_000 })
    await page
      .getByPlaceholder('Summary of the corrective action and verification of completion')
      .fill('Screenshot run — corrective action verified effective.')
    await shot(page, 'close-dialog')

    const signBtn = page.getByRole('button', { name: 'Sign & Close CAPA' })
    await expect(signBtn).toBeEnabled({ timeout: 15_000 })
    await signBtn.click()
    const pin = page.getByPlaceholder('Enter your e-signature PIN')
    await expect(pin).toBeVisible({ timeout: 15_000 })
    await shot(page, 'close-esign-dialog')

    const signPinBtn = page.getByRole('button', { name: 'Sign', exact: true })
    await expect(async () => {
      await pin.fill(ESIGN_PIN)
      await expect(signPinBtn).toBeEnabled({ timeout: 3_000 })
    }).toPass({ timeout: 20_000 })
    await signPinBtn.click()

    await waitForSqlValue(`SELECT status_id FROM capas WHERE id = '${capa.id}' AND status_id = 'CLOSED'`, {
      timeoutMs: 60_000,
      label: 'CAPA CLOSED',
    })
    await expect(async () => {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByText(/closed/i).first()).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 45_000 })
    await shot(page, 'detail-closed')

    await ctx.close()
  })

  test('cancel a pending CAPA with an e-signature', async ({ browser }) => {
    test.setTimeout(420_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()

    const title = uniqueTitle('S2-cancel')
    await createCapa(page, title)
    const capa = findCapaByTitle(title)
    await openCapa(page, capa.id)

    await page.getByRole('button', { name: 'Cancel CAPA' }).click()
    await expect(page.getByRole('heading', { name: 'Cancel CAPA' })).toBeVisible({ timeout: 15_000 })
    await page
      .getByPlaceholder('Why is this CAPA being cancelled?')
      .fill('Screenshot run — duplicate of an existing CAPA.')
    await shot(page, 'cancel-dialog')

    await page.getByRole('button', { name: 'Sign & Cancel CAPA' }).click()
    const pin = page.getByPlaceholder('Enter your e-signature PIN')
    await expect(pin).toBeVisible({ timeout: 15_000 })
    await shot(page, 'cancel-esign-dialog')

    const signPinBtn = page.getByRole('button', { name: 'Sign', exact: true })
    await expect(async () => {
      await pin.fill(ESIGN_PIN)
      await expect(signPinBtn).toBeEnabled({ timeout: 3_000 })
    }).toPass({ timeout: 20_000 })
    await signPinBtn.click()

    await waitForSqlValue(
      `SELECT status_id FROM capas WHERE id = '${capa.id}' AND status_id = 'CANCELLED'`,
      { timeoutMs: 60_000, label: 'CAPA CANCELLED' },
    )
    await expect(async () => {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByText(/cancelled/i).first()).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 45_000 })
    await shot(page, 'detail-cancelled')

    await ctx.close()
  })
})
