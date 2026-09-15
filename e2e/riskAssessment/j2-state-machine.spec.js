// RA-J2 — the informal state shape docs/modules/risk-assessment/
// 07-state-machine.md describes: IN PROGRESS -> FINALIZED -> COMMITTED, plus
// the "any edit after finalize clears the stamp" transition and the
// canFinalize gate itself (matrix cell alone — hazard category and the
// INITIAL/RESIDUAL toggle are both hidden fields, per the doc's own
// 2026-08-25 correction).
import { test, expect } from '@playwright/test'
import { AUTH, RISK_ASSESSMENT } from '../fixtures/cast.js'
import { findCapaByTitle, sqlValue } from '../fixtures/db.js'
import { createCapa, uniqueTitle, openCapa } from '../fixtures/capas.js'
import {
  selectMatrixCell,
  finalizeAssessment,
  waitForRiskAssessment,
  purgeRiskAssessment,
  completeRiskReviewStep,
  HIGH_CELL,
  LOW_CELL,
} from '../fixtures/riskAssessment.js'

test.describe('RA-J2 · finalize state machine', () => {
  test('IN PROGRESS -> FINALIZED requires a matrix cell; the button is disabled until one is picked', async ({
    browser,
  }) => {
    const ctxAuthor = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await ctxAuthor.newPage()
    const title = uniqueTitle('RA-J2-gate')
    await createCapa(authorPage, title, { workflowName: RISK_ASSESSMENT.workflowName })
    const capa = findCapaByTitle(title)
    purgeRiskAssessment(capa.id)
    await openCapa(authorPage, capa.id)
    await ctxAuthor.close()

    const ctxReviewer = await browser.newContext({ storageState: AUTH.reviewer })
    const page = await ctxReviewer.newPage()
    await page.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })

    // Before any cell is picked, the Finalize button is disabled and the hint
    // names what's missing (canFinalize === !!likelihoodId && !!severityId).
    const finalizeBtn = page.getByRole('button', { name: 'Finalize Assessment' })
    await expect(finalizeBtn).toBeVisible({ timeout: 20_000 })
    await expect(finalizeBtn).toBeDisabled()
    await expect(page.getByText('Pick a likelihood and severity on the matrix to finalize.')).toBeVisible()

    await selectMatrixCell(page, LOW_CELL)
    await expect(finalizeBtn).toBeEnabled()

    await finalizeAssessment(page)
    await expect(page.getByText(/^Finalized /)).toBeVisible({ timeout: 10_000 })
    await expect(finalizeBtn).toHaveCount(0)

    await ctxReviewer.close()
  })

  test('any input change after finalize clears the stamp — FINALIZED -> IN PROGRESS is automatic', async ({
    browser,
  }) => {
    const ctxAuthor = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await ctxAuthor.newPage()
    const title = uniqueTitle('RA-J2-clear')
    await createCapa(authorPage, title, { workflowName: RISK_ASSESSMENT.workflowName })
    const capa = findCapaByTitle(title)
    purgeRiskAssessment(capa.id)
    await openCapa(authorPage, capa.id)
    await ctxAuthor.close()

    const ctxReviewer = await browser.newContext({ storageState: AUTH.reviewer })
    const page = await ctxReviewer.newPage()
    await page.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })

    await selectMatrixCell(page, LOW_CELL)
    await finalizeAssessment(page)
    await expect(page.getByText(/^Finalized /)).toBeVisible({ timeout: 10_000 })

    // Clicking a DIFFERENT cell after finalize clears the stamp
    // (clearFinalizedStamp) — the Finalize button reappears, disabled state
    // gone since a cell is still selected.
    await selectMatrixCell(page, HIGH_CELL)
    const finalizeBtn = page.getByRole('button', { name: 'Finalize Assessment' })
    await expect(finalizeBtn).toBeVisible({ timeout: 10_000 })
    await expect(finalizeBtn).toBeEnabled()

    await finalizeAssessment(page)
    await expect(page.getByText(/^Finalized /)).toBeVisible({ timeout: 10_000 })
    await ctxReviewer.close()
  })

  test('FINALIZED -> COMMITTED requires the parent task to reach APPROVED — finalizing alone writes nothing', async ({
    browser,
  }) => {
    // "FINALIZED -> COMMITTED is not reachable by the widget itself — it
    // requires the parent record's workflow action to reach APPROVED."
    const ctxAuthor = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await ctxAuthor.newPage()
    const title = uniqueTitle('RA-J2-committed')
    await createCapa(authorPage, title, { workflowName: RISK_ASSESSMENT.workflowName })
    const capa = findCapaByTitle(title)
    purgeRiskAssessment(capa.id)
    await openCapa(authorPage, capa.id)
    await ctxAuthor.close()

    const ctxReviewer = await browser.newContext({ storageState: AUTH.reviewer })
    const page = await ctxReviewer.newPage()
    await page.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })
    await selectMatrixCell(page, HIGH_CELL)
    await finalizeAssessment(page)
    await expect(page.getByText(/^Finalized /)).toBeVisible({ timeout: 10_000 })
    await ctxReviewer.close()

    // No risk_assessments row yet — finalize is client-side only.
    const countBeforeApproval = sqlValue(
      `SELECT count(*) FROM risk_assessments WHERE resource_type = 'Capa' AND resource_id = '${capa.id}'`,
    )
    expect(countBeforeApproval, 'finalize alone never writes risk_assessments').toBe('0')

    // Now drive the step to APPROVED (Mark Complete on an autoApprove step).
    // completeRiskReviewStep re-selects the cell + finalizes on a fresh
    // context, which is fine — the record upserts to the SAME task/step.
    await completeRiskReviewStep(browser, capa.id, { cell: HIGH_CELL })
    const ra = await waitForRiskAssessment(capa.id)
    expect(ra.computedRiskLevelLabel).toBe(HIGH_CELL.riskLevel)
  })
})
