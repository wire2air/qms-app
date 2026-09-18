// Audits screenshots · S3 — standard authoring and version approval.
//   New Standard dialog (filled) → the v1.0 DRAFT standard, including the
//   "no approval workflow attached" warning that blocks submission → the Add
//   Requirement dialog → the Submit-for-Approval dialog → UNDER_REVIEW → the
//   EFFECTIVE standard.
// Flow mirrors PW-J6, including its REST attach step: no UI attaches the
// approval workflow (documented gap), so the journey reaches for the API.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, AUDIT_WORKFLOWS } from '../../fixtures/cast.js'
import {
  createStandard,
  addClause,
  attachStandardWorkflow,
  submitStandardVersion,
  approveStandardVersion,
  forceResync,
  versionsOfStandard,
} from '../../fixtures/audits.js'
import { waitForSqlValue } from '../../fixtures/db.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('audits')

test.describe('Audits screenshots · standard authoring + approval', () => {
  test('draft standard → requirements → submit → approve → effective', async ({ browser }) => {
    test.setTimeout(700_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()

    // ── New Standard dialog, filled ────────────────────────────────────────
    const stamp = Date.now()
    const code = `E2E_S3_${stamp}`
    await page.goto('/audits?tab=standards')
    await page.getByRole('button', { name: 'New Standard' }).click()
    await expect(page.getByRole('heading', { name: 'New Audit Standard' })).toBeVisible({
      timeout: 20_000,
    })
    await shot(page, 'new-standard-dialog')
    await page.keyboard.press('Escape')

    const standard = await createStandard(page, { name: `E2E S3 Standard ${stamp}`, code })
    const [v10] = versionsOfStandard(standard.id)

    // ── v1.0 DRAFT, un-submittable: no approval workflow attached ─────────
    await expect(
      page.getByText("No approval workflow attached. Drafts can't be submitted until one is set."),
    ).toBeVisible({ timeout: 30_000 })
    await shot(page, 'standard-draft-no-workflow')

    await attachStandardWorkflow(page, standard.id, AUDIT_WORKFLOWS.standardVersionId)
    // The PATCH happens outside the app, so IDB needs a forced re-bootstrap.
    await forceResync(page)
    await expect(
      page.getByText("No approval workflow attached. Drafts can't be submitted until one is set."),
    ).toHaveCount(0, { timeout: 30_000 })
    await shot(page, 'standard-draft-submittable')

    // ── Add Requirement dialog ─────────────────────────────────────────────
    await page.getByRole('button', { name: /add requirement/i }).first().click()
    await expect(page.getByRole('heading', { name: 'Add Requirement' })).toBeVisible({
      timeout: 20_000,
    })
    await shot(page, 'add-requirement-dialog')
    await page.keyboard.press('Escape')

    await addClause(page, { number: '1.1', title: 'Management responsibility' })
    await addClause(page, { number: '1.2', title: 'Internal communication' })
    await waitForSqlValue(
      `SELECT count(*) FROM audit_requirements
        WHERE audit_standard_version_id = '${v10.id}' AND deleted_at IS NULL`,
      { timeoutMs: 45_000, label: 'two clauses saved' },
    )
    await shot(page, 'standard-with-requirements')

    // ── Submit for approval ────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Submit for Approval' }).click()
    await expect(page.getByRole('heading', { name: 'Submit for Approval' })).toBeVisible({
      timeout: 20_000,
    })
    await shot(page, 'submit-standard-dialog')
    await page.keyboard.press('Escape')

    await submitStandardVersion(page, { changeSummary: 'Screenshot run — initial issue.' })
    await waitForSqlValue(
      `SELECT status_id FROM audit_standard_versions
        WHERE id = '${v10.id}' AND status_id = 'UNDER_REVIEW'`,
      { timeoutMs: 60_000, label: 'standard version UNDER_REVIEW' },
    )
    await expect(async () => {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByText(/under review/i).first()).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 60_000 })
    await shot(page, 'standard-under-review')

    // ── Reviewer + e-signing approver → EFFECTIVE ──────────────────────────
    await approveStandardVersion(browser, { standardId: standard.id, versionId: v10.id })
    await waitForSqlValue(
      `SELECT status_id FROM audit_standard_versions
        WHERE id = '${v10.id}' AND status_id = 'EFFECTIVE'`,
      { timeoutMs: 90_000, label: 'standard version EFFECTIVE' },
    )
    await expect(async () => {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByText(/effective/i).first()).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 60_000 })
    await shot(page, 'standard-effective')

    await ctx.close()
  })
})
