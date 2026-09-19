// Shared flows + DB assertions for the RCA (Root Cause Analysis) journeys.
//
// Fixtures live in qms/database/e2e-seed.sql §46 and are mirrored in cast.js
// as `RCA`. Three facts about this module shape everything below — the same
// three that shape its `riskAssessment` sibling, because both are driven by
// the same derivation service.
//
// 1. THERE IS NO STANDALONE RECORD PAGE. Per docs/modules/rca, the module's
//    only screen is /rca-templates (Templates CRUD + Categories admin) — the
//    analysis widget itself (RcaField.vue, field type `rca`) is embedded
//    inside a workflow step's task form. "Drive a root cause analysis" means
//    driving a CAPA through the dedicated `E2E RCA Review` workflow (§46e)
//    whose reviewer step carries that field, reusing fixtures/capas.js for
//    the CAPA scaffolding (create → Start CAPA → complete steps).
//
// 2. THE `root_causes` ROW IS WRITTEN SERVER-SIDE, ON APPROVAL, NOT ON
//    FINALIZE. Clicking "Finalize Analysis" only freezes
//    `modelValue.outcome.completedAt` client-side — the normalized row is
//    derived by rcaRaDerivationService.js the moment the task instance
//    carrying that step reaches APPROVED (COMPLETE_AND_ADVANCE), inside the
//    same transaction as the step completion. So the DB assertion barrier is
//    "the reviewer's Mark Complete finished", not "Finalize was clicked".
//
// 3. `root_causes` BORROWS ITS PERMISSIONS FROM THREE PARENT MODULES, NOT ITS
//    OWN. Its RLS ORs together capa|ncr|change_control|complaints' own
//    permissions (10-permission-matrix.md). F-01 (the UPDATE policy checking
//    only company_id, no permission clause at all) was CLOSED 2026-09-01
//    (migration 20260901180000), and a BEFORE UPDATE trigger
//    (enforce_root_cause_immutable, ERRCODE QMSRC) additionally refuses to
//    change anything but `deleted_at` even for a caller who holds that OR —
//    the immutability half F-01's policy fix alone did not provide. Both are
//    verified live in the rca project's PW-J2/PW-J4, mirroring
//    backend/api/tests/integration/rca/root-cause-integrity.test.js.
import { expect } from '@playwright/test'
import { AUTH, USERS } from './cast.js'
import { sqlRow, sqlValue, waitForSqlValue } from './db.js'
import { clickWhenReady } from './documents.js'

export const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

export const RCA_WORKFLOW_NAME = 'E2E RCA Review'
export const RCA_TEMPLATE_NAME = 'E2E RCA Template'
export const RCA_TEMPLATE_ID = 'e2ec1000-0000-4000-8000-000000000001'

/**
 * One browser context per persona, shared by every test in a spec file. Same
 * shape as fixtures/equipment.js's / fixtures/riskAssessment.js's
 * createPersonaPool.
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

/** Click one of the four method cards on the widget's method picker. */
export async function pickMethod(page, label) {
  await clickWhenReady(page, page.getByRole('button', { name: label, exact: false }))
}

/** Fill the primary root cause's rich-text description. */
export async function fillPrimaryDescription(page, text) {
  const editor = page.locator('.dynamic-form [contenteditable="true"]').last()
  await editor.click()
  await page.keyboard.insertText(text)
}

/**
 * Click "Finalize Analysis" on the embedded widget. NOT called by
 * `completeRcaReviewStep` below — WorkflowStepForm's `formFinalizers`
 * registry auto-finalizes any field with a non-empty primary description on
 * Mark Complete (see its header comment), so the explicit button is a
 * separate, UI-only affordance a spec can probe on its own without also
 * driving a full workflow step.
 */
export async function finalizeAnalysis(page) {
  await clickWhenReady(page, page.getByRole('button', { name: 'Finalize Analysis' }))
}

/**
 * Reviewer (step 1, ACTION) picks a method, writes the primary root cause,
 * and marks the step complete — the rca-carrying twin of
 * fixtures/capas.js#completeReviewerStep /
 * fixtures/riskAssessment.js#completeRiskReviewStep. Deliberately does NOT
 * click "Finalize Analysis" itself: Mark Complete's auto-finalize hook
 * (WorkflowStepForm.vue's `formFinalizers`) is what real users rely on, and
 * exercising that path rather than the explicit button is the more faithful
 * journey — PW-J1 probes the explicit button separately.
 */
export async function completeRcaReviewStep(
  browser,
  capaId,
  { method = 'Fishbone', description = 'E2E RCA — root cause identified via the widget.' } = {},
) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'Capa' AND entity_id = ${quote(capaId)}
        AND assigned_to = ${quote(USERS.reviewer.id)} AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
    { timeoutMs: 45_000, label: 'reviewer task assigned' },
  )
  const ctx = await browser.newContext({ storageState: AUTH.reviewer })
  const page = await ctx.newPage()
  await page.goto(`/capas/${capaId}`, { waitUntil: 'domcontentloaded' })

  await pickMethod(page, method)
  await fillPrimaryDescription(page, description)
  await clickWhenReady(page, page.getByRole('button', { name: 'Mark Complete' }))
  await ctx.close()
}

/**
 * The waiting barrier for "the reviewer's step reached APPROVED and the
 * derivation service ran" — the root_causes row for this CAPA.
 */
export function findRootCause(resourceId, { resourceType = 'Capa', primaryOnly = true } = {}) {
  const row = sqlRow(
    `SELECT id, method_used, category_id, category_label, description, is_primary,
            rca_template_id, rca_template_name, created_by, deleted_at
       FROM root_causes
      WHERE resource_type = ${quote(resourceType)} AND resource_id = ${quote(resourceId)}
        ${primaryOnly ? 'AND is_primary = true' : ''}
      ORDER BY created_at DESC LIMIT 1`,
  )
  if (!row) return null
  const nz = (v) => (v === '' ? null : v)
  return {
    id: row[0],
    methodUsed: nz(row[1]),
    categoryId: nz(row[2]),
    categoryLabel: nz(row[3]),
    description: nz(row[4]),
    isPrimary: row[5] === 't',
    rcaTemplateId: nz(row[6]),
    rcaTemplateName: nz(row[7]),
    createdBy: nz(row[8]),
    deletedAt: nz(row[9]),
  }
}

/** Poll until a root_causes row exists for this resource. */
export async function waitForRootCause(resourceId, opts = {}) {
  await waitForSqlValue(
    `SELECT count(*) FROM root_causes WHERE resource_type = 'Capa' AND resource_id = ${quote(resourceId)} AND deleted_at IS NULL`,
    { timeoutMs: 45_000, label: 'root_causes row derived', ...opts },
  )
  return findRootCause(resourceId)
}

/** Delete every root_causes row for a resource — test isolation for the workflow-driven journey (NOT the seeded §46d fixture, which lives at a fixed id and is restored by the seed itself). */
export function purgeRootCause(resourceId) {
  sqlValue(`DELETE FROM root_causes WHERE resource_type = 'Capa' AND resource_id = ${quote(resourceId)}`)
}

// Re-exported for specs that want an explicit assertion helper without
// importing Playwright's `expect` twice.
export { expect }
