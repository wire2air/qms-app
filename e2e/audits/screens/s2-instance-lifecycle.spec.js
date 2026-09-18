// Audits screenshots · S2 — an ad-hoc audit end to end.
//   Create dialog (filled) → SCHEDULED detail → Start → the Requirements
//   walkthrough (a Conforming verdict and a Major NC) → the auto-raised finding
//   on the Findings tab → the close-out gate → the Submit-for-Close-Out dialog →
//   REVIEW → reviewer task → approver e-signature → CLOSED → the printable
//   report.
// Flow mirrors PW-J2 / PW-J8.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, AUDIT_STANDARD, USERS } from '../../fixtures/cast.js'
import {
  createAdHocAudit,
  openAuditTab,
  startAudit,
  scoreClause,
  closeFinding,
  submitForCloseOut,
  completeCloseOutReview,
  completeCloseOutSignOff,
  findingsOf,
  uniqueScope,
} from '../../fixtures/audits.js'
import { waitForSqlValue } from '../../fixtures/db.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('audits')

test.describe('Audits screenshots · ad-hoc audit lifecycle', () => {
  test('create → walkthrough → finding → close-out → e-signed close → report', async ({
    browser,
  }) => {
    test.setTimeout(900_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    // The print view calls window.print() on load (as in PW-J8).
    await ctx.addInitScript(() => {
      window.print = () => {}
    })
    const page = await ctx.newPage()

    // ── SCHEDULED audit ────────────────────────────────────────────────────
    const scope = uniqueScope('S2')
    const audit = await createAdHocAudit(page, scope)
    await expect(page.getByText(audit.auditNumber).first()).toBeVisible({ timeout: 30_000 })
    await shot(page, 'detail-scheduled')

    // Information tab — the audit's own metadata panel.
    await openAuditTab(page, 'Information')
    await shot(page, 'detail-information-tab')

    // ── IN_PROGRESS + the requirements walkthrough ─────────────────────────
    await startAudit(page)
    await shot(page, 'detail-in-progress')

    await openAuditTab(page, 'Requirements')
    await expect(
      page.getByRole('heading', { name: AUDIT_STANDARD.clauses.documentControl.title }),
    ).toBeVisible({ timeout: 30_000 })
    await shot(page, 'requirements-walkthrough')

    await scoreClause(page, audit.id, AUDIT_STANDARD.clauses.documentControl, 'Conforming')
    await shot(page, 'requirements-clause-conforming')

    // A Major NC verdict auto-raises a finding in the same transaction.
    await scoreClause(page, audit.id, AUDIT_STANDARD.clauses.training, 'Major NC')
    await shot(page, 'requirements-clause-major-nc')

    await openAuditTab(page, 'Findings')
    const [finding] = findingsOf(audit.id)
    await expect(page.getByText(finding.findingNumber).first()).toBeVisible({ timeout: 30_000 })
    await shot(page, 'findings-tab')

    // ── The close-out gate, then the finding closed ────────────────────────
    await expect(page.getByRole('button', { name: /Submit for Close-Out.*open/i })).toBeVisible({
      timeout: 20_000,
    })
    await shot(page, 'close-out-blocked-open-findings')

    await closeFinding(page, finding.findingNumber)
    await waitForSqlValue(
      `SELECT count(*) FROM audit_findings
        WHERE audit_instance_id = '${audit.id}' AND status_id = 'CLOSED'`,
      { timeoutMs: 45_000, label: 'finding closed' },
    )
    await shot(page, 'findings-closed')

    // ── Submit for close-out ───────────────────────────────────────────────
    await submitForCloseOut(page, audit.id, { comments: 'Screenshot run — ready for close-out.' })
    await expect(async () => {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByText(/review/i).first()).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 60_000 })
    await shot(page, 'detail-review')

    // ── Reviewer, then the e-signing approver ──────────────────────────────
    await completeCloseOutReview(browser, audit.id)
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'AuditInstance' AND entity_id = '${audit.id}'
          AND assigned_to = '${USERS.approver.id}' AND deleted_at IS NULL
          AND status_id NOT IN ('CANCELLED')`,
      { timeoutMs: 60_000, label: 'sign-off task created' },
    )
    await completeCloseOutSignOff(browser, audit.id)
    await waitForSqlValue(
      `SELECT status_id FROM audit_instances WHERE id = '${audit.id}' AND status_id = 'CLOSED'`,
      { timeoutMs: 90_000, label: 'audit CLOSED' },
    )
    await expect(async () => {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByText(/closed/i).first()).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 60_000 })
    await shot(page, 'detail-closed')

    // ── Printable report (popup) ───────────────────────────────────────────
    const [report] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', { name: 'Report', exact: true }).click(),
    ])
    await report.waitForLoadState('domcontentloaded')
    await expect(report.getByRole('heading', { name: /Audit Report/ })).toBeVisible({
      timeout: 60_000,
    })
    await shot(report, 'print-report')
    await report.close()

    await ctx.close()
  })
})
