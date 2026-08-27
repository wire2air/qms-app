// Change Request screenshots · S1 — list + the full lifecycle.
//   List, the create form (blank → filled), the DRAFT record with its Approval
//   Workflow Plan (CR assigns reviewers on the detail page, not in a submit
//   dialog), the Submit-for-Approval confirm, UNDER_REVIEW, the three workflow
//   steps (impact review → e-signed approval → implementation), APPROVED, the
//   e-signed Close dialog, and — on a second CR — the Cancel dialog.
// Flow and selectors mirror PW-J1 / PW-J2.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, ESIGN_PIN } from '../../fixtures/cast.js'
import {
  createCr,
  assignDraftReviewers,
  submitCrForApproval,
  completeReviewerStep,
  completeApproverStep,
  completeImplementationStep,
  actionBarButton,
  uniqueTitle,
} from '../../fixtures/changeRequests.js'
import { findCrByTitle, waitForSqlValue } from '../../fixtures/db.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('changeRequests')

test.describe.serial('CR screenshots · create → approve → implement → close', () => {
  test('list, create form, draft plan, approval chain and e-signed close', async ({ browser }) => {
    test.setTimeout(900_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()

    // ── List ───────────────────────────────────────────────────────────────
    await page.goto('/change-requests')
    await expect(page.getByRole('button', { name: /create|new/i }).first()).toBeVisible({
      timeout: 30_000,
    })
    await shot(page, 'list')

    // ── Blank create form ──────────────────────────────────────────────────
    await page.goto('/change-requests/create')
    await expect(page.getByPlaceholder('Short summary of the change')).toBeVisible({
      timeout: 30_000,
    })
    await shot(page, 'create')

    // ── Filled form + the DRAFT record ─────────────────────────────────────
    const title = uniqueTitle('S1-lifecycle')
    await createCr(page, title, { priority: 'High' })
    const cr = findCrByTitle(title)
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 })
    await shot(page, 'detail-draft')

    // The approval plan (per-step reviewer pickers) lives on the record itself.
    await assignDraftReviewers(page, cr.id)
    await expect(page.getByText('Approval Workflow Plan')).toBeVisible({ timeout: 30_000 })
    await shot(page, 'detail-draft-workflow-plan')

    // ── Submit for approval ────────────────────────────────────────────────
    await page.goto(`/change-requests/${cr.id}`)
    await page.getByRole('button', { name: 'Submit for Approval' }).first().click()
    await expect(page.getByRole('heading', { name: 'Submit for Approval' })).toBeVisible({
      timeout: 15_000,
    })
    await shot(page, 'submit-for-approval-dialog')
    await page.keyboard.press('Escape')

    await submitCrForApproval(page, cr.id)
    await shot(page, 'detail-under-review')

    // ── Step 1 (impact review) then step 2 (e-signed approval) ─────────────
    await completeReviewerStep(browser, cr.id)
    await completeApproverStep(browser, cr.id)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await shot(page, 'detail-approval-steps-done')

    // ── Step 3 (implementation, owned by the author) → APPROVED ────────────
    await completeImplementationStep(page, cr.id)
    await waitForSqlValue(
      `SELECT status_id FROM change_requests
        WHERE id = '${cr.id}' AND status_id = 'OPEN' AND approved_at IS NOT NULL`,
      { timeoutMs: 90_000, label: 'workflow finished, CR still OPEN' },
    )
    await expect(async () => {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByText(/approved/i).first()).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 60_000 })
    await shot(page, 'detail-approved')

    // ── Close dialog → e-signature ─────────────────────────────────────────
    await actionBarButton(page, 'Close').click()
    await expect(page.getByRole('heading', { name: 'Close Change Request' })).toBeVisible({
      timeout: 15_000,
    })
    await page
      .getByPlaceholder('Summary of the change outcome, lessons learned, etc.')
      .fill('Screenshot run — change implemented and verified.')
    await shot(page, 'close-dialog')

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
      `SELECT status_id FROM change_requests WHERE id = '${cr.id}' AND status_id = 'CLOSED'`,
      { timeoutMs: 90_000, label: 'CR CLOSED' },
    )
    await page.goto(`/change-requests/${cr.id}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/closed/i).first()).toBeVisible({ timeout: 30_000 })
    await shot(page, 'detail-closed')

    await ctx.close()
  })

  test('cancel a change request with an e-signature', async ({ browser }) => {
    test.setTimeout(420_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()

    const title = uniqueTitle('S1-cancel')
    await createCr(page, title)
    const cr = findCrByTitle(title)

    await actionBarButton(page, 'Cancel').click()
    await expect(page.getByRole('heading', { name: 'Cancel Change Request' })).toBeVisible({
      timeout: 15_000,
    })
    await page
      .getByPlaceholder('Why is this Change Request being cancelled?')
      .fill('Screenshot run — superseded by another change.')
    await shot(page, 'cancel-dialog')

    await page.getByRole('button', { name: 'Sign & Cancel' }).click()
    const pin = page.getByPlaceholder('Enter your e-signature PIN')
    await expect(pin).toBeVisible({ timeout: 15_000 })
    await shot(page, 'cancel-esign-dialog')

    const signBtn = page.getByRole('button', { name: 'Sign', exact: true })
    await expect(async () => {
      await pin.fill(ESIGN_PIN)
      await expect(signBtn).toBeEnabled({ timeout: 3_000 })
    }).toPass({ timeout: 20_000 })
    await signBtn.click()

    await waitForSqlValue(
      `SELECT status_id FROM change_requests WHERE id = '${cr.id}' AND status_id = 'CANCELLED'`,
      { timeoutMs: 90_000, label: 'CR CANCELLED' },
    )
    await page.goto(`/change-requests/${cr.id}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/cancelled/i).first()).toBeVisible({ timeout: 30_000 })
    await shot(page, 'detail-cancelled')

    await ctx.close()
  })

  test('denial states — no permission and unauthenticated', async ({ browser }) => {
    test.setTimeout(120_000)
    const denied = await browser.newContext({ storageState: AUTH.noAccess })
    const deniedPage = await denied.newPage()
    await deniedPage.goto('/change-requests')
    await expect(deniedPage).toHaveURL(/\/no-access/, { timeout: 30_000 })
    await shot(deniedPage, 'no-access')
    await denied.close()

    const anon = await browser.newContext() // no session
    const anonPage = await anon.newPage()
    await anonPage.goto('/change-requests')
    await expect(anonPage).toHaveURL(/\/signin/, { timeout: 30_000 })
    await shot(anonPage, 'signin-redirect')
    await anon.close()
  })
})
