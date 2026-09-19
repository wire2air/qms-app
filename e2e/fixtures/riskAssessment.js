// Shared flows + DB assertions for the Risk Assessment journeys.
//
// Fixtures live in qms/database/e2e-seed.sql §44 and are mirrored in cast.js
// as `RISK_ASSESSMENT`. Three facts about this module shape everything below.
//
// 1. THERE IS NO STANDALONE RECORD PAGE. Per docs/modules/risk-assessment,
//    `risk_assessments` is "a capture mechanism with no consumption
//    mechanism" — the only UI is (a) the admin CRUD at
//    /risk-assessment-templates (risk_assessment_templates, the matrix
//    designer) and (b) a form-builder widget (RiskAssessmentField.vue,
//    field type `riskAssessment`) embedded inside a workflow step's task
//    form. So "drive a risk assessment" means driving a CAPA through the
//    dedicated `E2E Risk Assessment Review` workflow (§44c) whose reviewer
//    step carries that field, reusing fixtures/capas.js for the CAPA
//    scaffolding (create → Start CAPA → complete steps).
//
// 2. THE ROW IS WRITTEN SERVER-SIDE, ON APPROVAL, NOT ON FINALIZE.
//    Finalizing the widget only freezes `modelValue.finalized` client-side
//    (07-state-machine.md's FINALIZED state) — the `risk_assessments` row
//    itself is derived by `rcaRaDerivationService.js` the moment the task
//    instance carrying that step reaches APPROVED (COMPLETE_AND_ADVANCE),
//    inside the same transaction as the step-completion. So the DB
//    assertion barrier is "the reviewer's Mark Complete finished", not
//    "the Finalize button was clicked".
//
// 3. risk_assessments HAS NO PERMISSION MODULE OF ITS OWN. Its RLS ORs
//    together the borrowed `capa|ncr|change_control` permissions
//    (10-permission-matrix.md). F-01 (the UPDATE policy checking only
//    company_id, with no permission clause at all) was CLOSED 2026-09-01
//    (migration 20260901180000) — verified live in J3 below and already
//    integration-tested in
//    backend/api/tests/integration/riskAssessment/risk-assessment-rls.test.js.
import { expect } from '@playwright/test'
import { AUTH, USERS } from './cast.js'
import { sqlRow, sqlValue, waitForSqlValue } from './db.js'
import { clickWhenReady } from './documents.js'

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

export const RA_WORKFLOW_NAME = 'E2E Risk Assessment Review'
export const RA_TEMPLATE_NAME = 'E2E Risk Matrix'
export const RA_TEMPLATE_ID = 'e2eba000-0000-4000-8000-000000000001'

// The HIGH cell (High likelihood x Severe severity) — the one journeys click
// by default. Row/column header text as rendered by RiskAssessmentField.vue
// (`{{ row.label }}` / `{{ col.label }}`), matching §44b's config JSONB.
export const HIGH_CELL = { likelihood: 'High', severity: 'Severe', riskLevel: 'High', rpn: 9 }
export const LOW_CELL = { likelihood: 'Low', severity: 'Minor', riskLevel: 'Low', rpn: 1 }

/**
 * One browser context per persona, shared by every test in a spec file. Same
 * shape as fixtures/equipment.js's createPersonaPool.
 */
export function createPersonaPool() {
  const pool = new Map()
  return {
    async page(browser, storageState) {
      if (!pool.has(storageState)) {
        const ctx = await browser.newContext({ storageState })
        pool.set(storageState, { ctx, page: await ctx.newPage() })
      }
      return pool.get(storageState).page
    },
    async close() {
      for (const { ctx } of pool.values()) await ctx.close().catch(() => {})
      pool.clear()
    },
  }
}

/**
 * Click a matrix cell by its row/column header labels. Works for both the
 * embedded RiskAssessmentField (click-to-select) — the admin template editor
 * uses cycle-to-select instead and is not driven through this helper.
 */
export async function selectMatrixCell(page, { likelihood, severity }) {
  // A fresh CAPA detail load races the SyncEngine's bootstrap burst (measured:
  // 200+ GraphQL requests in the first second, tapering over ~15s) — the
  // matrix table keeps re-rendering under that load, detaching the target
  // <td> mid-click even though Playwright re-resolves the locator on every
  // attempt. Let the burst settle before touching the table.
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  // The widget renders its header (and the Matrix picker, already showing the
  // template NAME) before the matrix itself exists: RiskAssessmentField reads
  // the template's `config` out of IndexedDB via useLiveQueryWithDeps, so the
  // grid only draws once that row has synced. Measured: the picker read
  // "E2E Risk Matrix" while no <table> was on the page at all, which surfaced
  // as colIndex === -1 rather than as a missing-element error. Wait for the
  // table itself, not just for the page to settle.
  const table = page.locator('table').filter({ has: page.getByText('Likelihood', { exact: false }) })
  await expect(table.first()).toBeVisible({ timeout: 30_000 })
  const row = page.locator('tbody tr', { has: page.getByText(likelihood, { exact: false }) })
  await expect(row.first()).toBeVisible({ timeout: 15_000 })
  // The column index is the position of `severity` among the header cells —
  // resolve it once so the click lands in the right <td>, not just any cell.
  const headers = table.locator('thead th')
  const count = await headers.count()
  let colIndex = -1
  for (let i = 1; i < count; i++) {
    const text = await headers.nth(i).innerText()
    if (text.includes(severity)) {
      colIndex = i
      break
    }
  }
  expect(colIndex, `column header "${severity}" was found`).toBeGreaterThan(0)
  await row.first().locator('td').nth(colIndex).click()
}

/** Click "Finalize Assessment" on the embedded widget. */
export async function finalizeAssessment(page) {
  await clickWhenReady(page, page.getByRole('button', { name: 'Finalize Assessment' }))
}

/**
 * The waiting barrier for "the reviewer's step reached APPROVED and the
 * derivation service ran" — the risk_assessments row for this CAPA.
 */
export function findRiskAssessment(resourceId, { resourceType = 'Capa' } = {}) {
  const row = sqlRow(
    `SELECT id, likelihood_id, likelihood_label, severity_id, severity_label,
            computed_risk_level_id, computed_risk_level_label, computed_score,
            justification, created_by, assessment_type, deleted_at
       FROM risk_assessments
      WHERE resource_type = ${quote(resourceType)} AND resource_id = ${quote(resourceId)}
      ORDER BY created_at DESC LIMIT 1`,
  )
  if (!row) return null
  const nz = (v) => (v === '' ? null : v)
  return {
    id: row[0],
    likelihoodId: nz(row[1]),
    likelihoodLabel: nz(row[2]),
    severityId: nz(row[3]),
    severityLabel: nz(row[4]),
    computedRiskLevelId: nz(row[5]),
    computedRiskLevelLabel: nz(row[6]),
    computedScore: nz(row[7]) === null ? null : Number(row[7]),
    justification: nz(row[8]),
    createdBy: nz(row[9]),
    assessmentType: nz(row[10]),
    deletedAt: nz(row[11]),
  }
}

/** Poll until a risk_assessments row exists for this resource. */
export async function waitForRiskAssessment(resourceId, opts = {}) {
  await waitForSqlValue(
    `SELECT count(*) FROM risk_assessments WHERE resource_type = 'Capa' AND resource_id = ${quote(resourceId)}`,
    { timeoutMs: 45_000, label: 'risk_assessments row derived', ...opts },
  )
  return findRiskAssessment(resourceId)
}

/** Delete every risk_assessments row for a resource — test isolation. */
export function purgeRiskAssessment(resourceId) {
  sqlValue(`DELETE FROM risk_assessments WHERE resource_type = 'Capa' AND resource_id = ${quote(resourceId)}`)
}

/**
 * Reviewer (step 1, ACTION) fills the risk matrix, finalizes, and marks the
 * step complete — the riskAssessment-carrying twin of
 * fixtures/capas.js#completeReviewerStep. autoApprove on this step means
 * Mark Complete both saves the record AND fires COMPLETE_AND_ADVANCE, so the
 * derivation service runs inline — no separate approve step for the ACTION
 * side.
 */
export async function completeRiskReviewStep(browser, capaId, { cell = HIGH_CELL, justification } = {}) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'Capa' AND entity_id = ${quote(capaId)}
        AND assigned_to = ${quote(USERS.reviewer.id)} AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
    { timeoutMs: 45_000, label: 'reviewer task assigned' },
  )
  const ctx = await browser.newContext({ storageState: AUTH.reviewer })
  const page = await ctx.newPage()
  await page.goto(`/capas/${capaId}`, { waitUntil: 'domcontentloaded' })

  await selectMatrixCell(page, cell)
  if (justification) {
    const editor = page.locator('.dynamic-form [contenteditable="true"]').first()
    await editor.click()
    await page.keyboard.insertText(justification)
  }
  await clickWhenReady(page, page.getByRole('button', { name: 'Mark Complete' }))
  await ctx.close()
}
