// PW-J1 — the RCA record lifecycle: a CAPA on the dedicated `E2E RCA Review`
// workflow, the reviewer performs a real root cause analysis through the
// embedded widget, marks the step complete, and the server derives a
// root_causes row from the frozen payload the moment that task reaches
// APPROVED. Then the approver e-signs the final step.
//
// WHY A CAPA, NOT A STANDALONE "ROOT CAUSE ANALYSIS" ENTITY. There is no such
// entity to create — docs/modules/rca/01-module-overview.md is explicit that
// the module "has no page of its own for its actual content": /rca-templates
// administers templates and categories only. The only UI for an actual
// analysis is the embedded widget (RcaField.vue, field type `rca`) inside a
// workflow step's task form, and the row it produces (root_causes) is
// written server-side by rcaRaDerivationService.js on approval, not by any
// client-callable mutation. So "the CRUD lifecycle" for this module IS
// driving a host record's workflow through a step that carries the field —
// the CAPA scaffolding is reused wholesale from fixtures/capas.js, exactly
// the way the riskAssessment sibling project does for the same reason.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, RCA } from '../fixtures/cast.js'
import { findCapaByTitle, waitForSqlValue } from '../fixtures/db.js'
import {
  createCapa,
  uniqueTitle,
  openCapa,
  completeApproverStep,
  closeCapa,
} from '../fixtures/capas.js'
import {
  completeRcaReviewStep,
  finalizeAnalysis,
  fillPrimaryDescription,
  pickMethod,
  waitForRootCause,
  purgeRootCause,
} from '../fixtures/rca.js'

test.describe('PW-J1 · RCA analysis lifecycle (embedded widget → derived record)', () => {
  test('reviewer performs the analysis, finalizes, marks complete — the row is derived on approval', async ({
    page,
    browser,
  }) => {
    await page.context().addCookies([])
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const authorPage = await ctx.newPage()

    const title = uniqueTitle('RCA-J1')
    await createCapa(authorPage, title, { workflowName: RCA.workflowName })
    const capa = findCapaByTitle(title)
    expect(capa, 'the CAPA landed in Postgres').not.toBeNull()
    purgeRootCause(capa.id)

    await openCapa(authorPage, capa.id)
    await ctx.close()

    // The reviewer's step carries the `rca` field bound to RCA.template.id
    // (skips the picker) — pick 5 Whys this time so the derived row's
    // method_used exercises the vocabulary the product actually writes
    // (RootCause.Method.FIVE_WHY = '5WHY'), not just Fishbone's default.
    await completeRcaReviewStep(browser, capa.id, {
      method: '5 Whys',
      description: 'Operator was not trained on the updated work instruction (PW-J1).',
    })

    const rootCause = await waitForRootCause(capa.id)
    expect(rootCause, 'root_causes row derived on step completion').not.toBeNull()
    expect(rootCause.isPrimary).toBe(true)
    expect(rootCause.methodUsed, 'the product vocabulary, not the model enum').toBe('5WHY')
    expect(rootCause.rcaTemplateId).toBe(RCA.template.id)
    expect(rootCause.rcaTemplateName).toBe(RCA.template.name)
    expect(rootCause.description).toContain('PW-J1')
    expect(rootCause.createdBy).toBe(USERS.reviewer.id)
    expect(rootCause.deletedAt).toBeNull()

    // Step 2 — approver e-signs. Reuses fixtures/capas.js unmodified: the
    // dedicated workflow's step 2 has the same shape (APPROVAL + e-sign) as
    // every other CAPA workflow's.
    await completeApproverStep(browser, capa.id)

    // Finishing the workflow does NOT close the CAPA — closing is a separate
    // e-signed owner action (capas/j3-close-gates-esign drives exactly this
    // sequence). Measured on app-db: of 13 CAPA/workflow combinations, CLOSED
    // occurs only where closeCapa ran; all 12 CAPAs on this RCA workflow and
    // all 30 on the Risk Assessment one sit at OPEN. The original assertion
    // here expected the approver step alone to close it, which no CAPA has
    // ever done.
    await waitForSqlValue(
      `SELECT count(*) FROM workflow_instances
        WHERE resource_type = 'Capa' AND resource_id = '${capa.id}'
          AND status_id != 'IN_PROGRESS'`,
      { timeoutMs: 30_000, label: 'workflow finished' },
    )
    const ownerCtx = await browser.newContext({ storageState: AUTH.owner })
    const ownerPage = await ownerCtx.newPage()
    try {
      await openCapa(ownerPage, capa.id)
      await closeCapa(ownerPage, { comments: 'E2E close — root cause recorded (PW-J1).' })
      await expect
        .poll(() => findCapaByTitle(title)?.statusId, { timeout: 30_000 })
        .toBe('CLOSED')
    } finally {
      await ownerCtx.close()
    }

    purgeRootCause(capa.id)
  })

  test('the explicit "Finalize Analysis" button freezes the outcome client-side', async ({
    browser,
  }) => {
    // A separate, narrower probe of the UI-only affordance PW-J1's main test
    // deliberately does NOT exercise (see fixtures/rca.js#finalizeAnalysis) —
    // clicking it should hide the button and show the "Completed" marker,
    // proving the widget's own finalize path works independently of the
    // Mark Complete auto-finalize hook.
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    try {
      const title = uniqueTitle('RCA-J1-FIN')
      await createCapa(page, title, { workflowName: RCA.workflowName })
      const capa = findCapaByTitle(title)
      purgeRootCause(capa.id)
      await openCapa(page, capa.id)

      const reviewerCtx = await browser.newContext({ storageState: AUTH.reviewer })
      const reviewerPage = await reviewerCtx.newPage()
      try {
        await reviewerPage.goto(`/capas/${capa.id}`, { waitUntil: 'domcontentloaded' })
        await pickMethod(reviewerPage, 'Fishbone')
        await fillPrimaryDescription(reviewerPage, 'PW-J1 explicit-finalize probe.')
        await expect(reviewerPage.getByRole('button', { name: 'Finalize Analysis' })).toBeVisible({
          timeout: 15_000,
        })
        await finalizeAnalysis(reviewerPage)
        await expect(reviewerPage.getByText('✓ Completed')).toBeVisible({ timeout: 10_000 })
        await expect(
          reviewerPage.getByRole('button', { name: 'Finalize Analysis' }),
        ).toHaveCount(0)
      } finally {
        await reviewerCtx.close()
      }

      purgeRootCause(capa.id)
    } finally {
      await ctx.close()
    }
  })
})
