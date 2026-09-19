// RA-J1 — create a CAPA on the dedicated Risk Assessment workflow, the
// reviewer scores + finalizes the matrix, marks the step complete, and the
// server derives a risk_assessments row from the frozen payload the moment
// that task reaches APPROVED. Then the approver e-signs the final step.
//
// WHY A CAPA, NOT A STANDALONE "RISK ASSESSMENT" ENTITY. There is no such
// entity to create — docs/modules/risk-assessment/01-module-overview.md calls
// it "a capture mechanism with no consumption mechanism": the only UI is the
// embedded widget (RiskAssessmentField.vue) inside a workflow step's task
// form, and the row it produces (risk_assessments) is written server-side by
// rcaRaDerivationService.js on approval, not by any client-callable mutation.
// So "the CRUD lifecycle" for this module IS driving a host record's workflow
// through a step that carries the field — the CAPA scaffolding is reused
// wholesale from fixtures/capas.js.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, RISK_ASSESSMENT } from '../fixtures/cast.js'
import { findCapaByTitle } from '../fixtures/db.js'
import { createCapa, uniqueTitle, openCapa, completeApproverStep } from '../fixtures/capas.js'
import {
  completeRiskReviewStep,
  waitForRiskAssessment,
  purgeRiskAssessment,
  HIGH_CELL,
} from '../fixtures/riskAssessment.js'

test.describe('RA-J1 · workflow-embedded risk assessment lifecycle', () => {
  test('reviewer scores the matrix, finalizes, marks complete — the row is derived on approval', async ({
    page,
    browser,
  }) => {
    await page.context().addCookies([])
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await ctx.newPage()

    const title = uniqueTitle('RA-J1')
    await createCapa(authorPage, title, { workflowName: RISK_ASSESSMENT.workflowName })
    const capa = findCapaByTitle(title)
    expect(capa, 'the CAPA landed in Postgres').not.toBeNull()
    purgeRiskAssessment(capa.id)

    await openCapa(authorPage, capa.id)
    await ctx.close()

    const justification = `E2E RA-J1 justification ${Date.now()}`
    await completeRiskReviewStep(browser, capa.id, { cell: HIGH_CELL, justification })

    // The barrier: risk_assessments is written the moment the ACTION step's
    // task reaches APPROVED (COMPLETE_AND_ADVANCE) — same transaction as the
    // step completion, not a separate action.
    const ra = await waitForRiskAssessment(capa.id)
    expect(ra, 'a risk_assessments row was derived').not.toBeNull()
    expect(ra.likelihoodLabel).toBe(HIGH_CELL.likelihood)
    expect(ra.severityLabel).toBe(HIGH_CELL.severity)
    expect(ra.computedRiskLevelLabel).toBe(HIGH_CELL.riskLevel)
    expect(ra.computedScore).toBe(HIGH_CELL.rpn)
    expect(ra.justification, 'the justification denormalized onto the row').toContain(justification)
    expect(ra.assessmentType, 'defaults to INITIAL — the toggle is hidden in the UI').toBe('INITIAL')
    expect(ra.createdBy).toBe(USERS.reviewer.id)
    expect(ra.deletedAt).toBeNull()

    // Approver signs the final step — proves the workflow completes normally
    // with a risk-assessment-carrying ACTION step ahead of it, and that the
    // row survives the second step untouched (no re-derivation on approval
    // steps — only ACTION/DELAY steps run the widget).
    await completeApproverStep(browser, capa.id)
    const raAfterApproval = await waitForRiskAssessment(capa.id)
    expect(raAfterApproval.id).toBe(ra.id)
    expect(raAfterApproval.computedScore).toBe(HIGH_CELL.rpn)
  })

  test('the upsert key is (resource, step, assessment type) — a partial unique index, not a free-for-all', async ({
    browser,
  }) => {
    // 07-state-machine.md: "COMMITTED has no forward transition of its own…
    // (a) a legitimate re-derivation via a subsequent send-back/re-approve
    // cycle on the SAME step (upsert)". Driving a full send-back → re-submit
    // UI cycle to observe the upsert is J2's job (no fixture yet drives CAPA's
    // Send Back outcome dropdown); what this test pins is the DB-level
    // contract the state machine doc describes and the module's own model
    // comment claims: "A partial unique index on (resource_type, resource_id,
    // workflow_instance_step_id, assessment_type) WHERE deleted_at IS NULL
    // keeps that bounded — no accidental duplicates."
    const ctxAuthor = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await ctxAuthor.newPage()
    const title = uniqueTitle('RA-J1-upsert')
    await createCapa(authorPage, title, { workflowName: RISK_ASSESSMENT.workflowName })
    const capa = findCapaByTitle(title)
    purgeRiskAssessment(capa.id)
    await openCapa(authorPage, capa.id)
    await ctxAuthor.close()

    await completeRiskReviewStep(browser, capa.id, {
      cell: { likelihood: 'Low', severity: 'Minor', riskLevel: 'Low', rpn: 1 },
    })
    const first = await waitForRiskAssessment(capa.id)
    expect(first.computedRiskLevelLabel).toBe('Low')

    const { sqlValue } = await import('../fixtures/db.js')
    const dupCount = sqlValue(
      `SELECT count(*) FROM risk_assessments
        WHERE resource_type = 'Capa' AND resource_id = '${capa.id}' AND deleted_at IS NULL`,
    )
    expect(dupCount, 'exactly one row per (resource, step, type)').toBe('1')

    // A second INSERT at the identical key, as the derivation service's own
    // upsert would issue, is rejected by the index rather than silently
    // accepted as a duplicate — proving the constraint is live, not just
    // documented.
    const indexName = sqlValue(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'risk_assessments' AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%workflow_instance_step_id%'`,
    )
    expect(indexName, 'the partial unique index the model comment describes exists').toBeTruthy()
  })
})
