// PW-J11 · CAPA required-field refusals — the negative half of OQ-04 TC-04-01.
//
// WHY THIS FILE EXISTS. `createCapa` always fills every field correctly, so
// nothing anywhere asserted that a CAPA *cannot* be created without a site, an
// owner, a type, a source, a priority or a workflow. OQ-04 TC-04-01 step 3 asks
// for exactly that ("Attempt to submit without site, department, CAPA type,
// source, priority or owner → refused in each case, identifying the missing
// field"), and it was the single largest reason that test case scored PARTIAL.
//
// The form declares `:rules="[required()]"` per field (CapasCreate.vue) and
// BaseForm renders its ValidationSummary on submit. That is a CLIENT gate. The
// server gate is `createCapaSchema` (zod) on POST /v1/services/capas, and that
// is the one a raw client cannot skip — so the per-field arms below are REST,
// and the UI gets one arm proving the user is actually told.
//
// The control test runs FIRST and is not optional: if the valid body stopped
// being valid for some unrelated reason, every negative arm would 400 for the
// wrong reason and pass while proving nothing.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, SITES, DEPARTMENTS, COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue, findCapaByTitle } from '../fixtures/db.js'
import { uniqueTitle } from '../fixtures/capas.js'
import {
  expectEmptyFormRefused,
  expectMissingFieldRefused,
  expectValidBodyAccepted,
} from '../fixtures/negativeArms.js'

const CAPA_WORKFLOW_NAME = 'E2E CAPA Review & Approval'

/** The published workflow version the create form and REST body both need. */
function publishedCapaWorkflowVersion() {
  return sqlValue(`
    SELECT wv.id
      FROM workflow_versions wv
      JOIN workflows w ON w.id = wv.workflow_id
     WHERE w.name = '${CAPA_WORKFLOW_NAME}'
       AND wv.status_id = 'PUBLISHED'
     ORDER BY wv.created_at DESC
     LIMIT 1`)
}

/**
 * Scoped to the tenant on purpose. This count is the evidence that a refused
 * create wrote NOTHING, so it is compared before and after the refusal — and an
 * unscoped `count(*)` makes any concurrent insert anywhere in the database
 * (a graphile_worker job, another tenant's fixture, a leaked row from an
 * earlier spec) look like the refused create having written a row. That is a
 * SECURITY-SHAPED false positive: it reports "a rejected request created a
 * record", which is the most alarming thing this suite can say.
 */
function capaCount() {
  return Number(
    sqlValue(`SELECT count(*) FROM capas WHERE company_id = '${COMPANY_ID}'`),
  )
}

/**
 * A body that really does create a CAPA. Every negative arm is this minus one
 * key, so the control test below has to pass or the whole file is theatre.
 */
function validCapaBody(title) {
  return {
    title,
    description: 'PW-J11 — required-field arm control body.',
    siteId: SITES.primary.id,
    departmentId: DEPARTMENTS.quality.id,
    typeId: 'CORRECTIVE',
    sourceType: 'INTERNAL_OBSERVATION',
    priorityId: 'MEDIUM',
    initiatedAt: new Date().toISOString(),
    ownerId: USERS.author.id,
    workflowVersionId: publishedCapaWorkflowVersion(),
  }
}

// Every required key in createCapaSchema that a user supplies. `title` is
// covered too — it is the one field the UI disables submit on, so proving the
// server also refuses it is the point.
const REQUIRED_KEYS = [
  'title',
  'siteId',
  'departmentId',
  'typeId',
  'sourceType',
  'priorityId',
  'initiatedAt',
  'ownerId',
  'workflowVersionId',
]

test.describe('PW-J11 · CAPA required-field refusals', () => {
  test.use({ storageState: AUTH.author })

  test('control: the body every negative arm is derived from is accepted', async ({ browser }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const title = uniqueTitle('J11-control')

    await expectValidBodyAccepted(ctx, { path: '/capas', validBody: validCapaBody(title) })

    const capa = findCapaByTitle(title)
    expect(capa, 'the control body created a real CAPA').toBeTruthy()
    expect(capa.statusId, 'created in DRAFT').toBe('DRAFT')

    // Clean up — this suite shares a tenant and DRAFT rows accumulate into
    // every later browser context's syncEngine bootstrap.
    sql(`DELETE FROM capas WHERE id = '${capa.id}'`)
    await ctx.close()
  })

  for (const key of REQUIRED_KEYS) {
    test(`REST: creating a CAPA without '${key}' is refused 400 and writes nothing`, async ({
      browser,
    }) => {
      test.setTimeout(60_000)
      const ctx = await browser.newContext({ storageState: AUTH.author })

      await expectMissingFieldRefused(ctx, {
        path: '/capas',
        validBody: validCapaBody(uniqueTitle(`J11-no-${key}`)),
        omit: key,
        countRows: capaCount,
      })

      await ctx.close()
    })
  }

  test('UI: submitting an empty create form tells the user what is missing', async ({ page }) => {
    test.setTimeout(120_000)

    await expectEmptyFormRefused(page, {
      createPath: '/capas/create',
      submitLabel: 'Create CAPA',
      countRows: capaCount,
      // Workflow-first wizard: screen 1 is a card gallery and Create CAPA only
      // exists on screen 2. Clicking the card is the whole advance —
      // WorkflowVersionSelect fires `@pick="goToDetails"`, so the screen swaps
      // itself and the "Continue" button is gone before it can be clicked.
      // (Waiting for it is what made the first run of this arm fail.) With
      // exactly one active CAPA workflow screen 1 auto-skips entirely, so
      // tolerate either shape, the same way `fillCapaCreateForm` does.
      async reach(p) {
        const card = p.getByRole('button', { name: `Select workflow ${CAPA_WORKFLOW_NAME}` })
        const submit = p.getByRole('button', { name: 'Create CAPA' })
        await expect(card.or(submit).first()).toBeVisible({ timeout: 45_000 })
        if (await card.isVisible().catch(() => false)) await card.click()
        await expect(submit, 'the card click should land on the details form').toBeVisible({
          timeout: 30_000,
        })
      },
    })
  })
})
