// PW-J11 · NC required-field refusals — the negative half of OQ-03 TC-03-01.
//
// WHY THIS FILE EXISTS. `raiseNc` always fills every field correctly, so nothing
// asserted that an NC *cannot* be raised without a severity, a type, a detection
// source, a site, a department, an owner or a workflow. OQ-03 TC-03-01 spends
// six of its nine steps on exactly those refusals (steps 2–7), and every one of
// them was uncovered — which is why that test case scored PARTIAL despite the
// module having nine spec files.
//
// Client vs server, and why the arms are REST. NonconformancesCreate.vue
// declares `:rules="[required()]"` per field, plus a richTextFilled rule for the
// Description, and disables submit on an empty title. All client-side. The gate
// that actually holds is `createAndSubmitNcSchema` on
// POST /v1/services/nonconformances.
//
// NOTE the draft route is deliberately NOT tested here: POST
// /nonconformances/draft takes `createAndSubmitNcSchema.partial()` with title
// only, on purpose — the point of a draft is writing an NC down mid-shift before
// the details exist. Completeness is enforced at OPEN (submitForReview names the
// missing fields, and the `nc_complete_when_open` CHECK backs it at the
// database). Asserting refusals against the draft route would contradict a
// deliberate design decision.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, SITES, DEPARTMENTS, FIXTURES, COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue, findNcByTitle } from '../fixtures/db.js'
import { uniqueTitle } from '../fixtures/nonconformances.js'
import {
  expectEmptyFormRefused,
  expectMissingFieldRefused,
  expectValidBodyAccepted,
} from '../fixtures/negativeArms.js'

function publishedNcWorkflowVersion() {
  return sqlValue(`
    SELECT wv.id
      FROM workflow_versions wv
      JOIN workflows w ON w.id = wv.workflow_id
     WHERE w.name = '${FIXTURES.ncrWorkflowName}'
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
function ncCount() {
  return Number(
    sqlValue(`SELECT count(*) FROM nonconformances WHERE company_id = '${COMPANY_ID}'`),
  )
}

/** Mirrors the body PW-J10 proves the raise endpoint accepts. */
function validNcBody(title) {
  return {
    title,
    description: 'PW-J11 — required-field arm control body.',
    siteId: SITES.primary.id,
    departmentId: DEPARTMENTS.quality.id,
    typeId: 'PROCESS',
    sourceId: 'IN_PROCESS',
    severityId: 'MAJOR',
    detectedAt: new Date().toISOString(),
    ownerId: USERS.author.id,
    workflowVersionId: publishedNcWorkflowVersion(),
  }
}

const REQUIRED_KEYS = [
  'title',
  'siteId',
  'departmentId',
  'typeId',
  'sourceId',
  'severityId',
  'detectedAt',
  'ownerId',
  'workflowVersionId',
]

test.describe('PW-J11 · NC required-field refusals', () => {
  test.use({ storageState: AUTH.author })

  test('control: the body every negative arm is derived from is accepted', async ({ browser }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const title = uniqueTitle('J11-control')

    await expectValidBodyAccepted(ctx, {
      path: '/nonconformances',
      validBody: validNcBody(title),
    })

    const nc = findNcByTitle(title)
    expect(nc, 'the control body created a real NC').toBeTruthy()

    sql(`DELETE FROM nonconformances WHERE id = '${nc.id}'`)
    await ctx.close()
  })

  for (const key of REQUIRED_KEYS) {
    test(`REST: raising an NC without '${key}' is refused 400 and writes nothing`, async ({
      browser,
    }) => {
      test.setTimeout(60_000)
      const ctx = await browser.newContext({ storageState: AUTH.author })

      await expectMissingFieldRefused(ctx, {
        path: '/nonconformances',
        validBody: validNcBody(uniqueTitle(`J11-no-${key}`)),
        omit: key,
        countRows: ncCount,
      })

      await ctx.close()
    })
  }

  test('UI: submitting an empty create form tells the user what is missing', async ({ page }) => {
    test.setTimeout(120_000)

    await expectEmptyFormRefused(page, {
      createPath: '/nonconformances/create',
      submitLabel: 'Create NC',
      countRows: ncCount,
      // Same wizard shape as CAPA: the card click advances the screen by itself.
      // With one active NC workflow screen 1 auto-skips, which is why an earlier
      // version of this hook passed here while the identical CAPA hook failed —
      // the redundant "Continue" click was simply never reached. Don't
      // reintroduce it.
      async reach(p) {
        const card = p.getByRole('button', {
          name: `Select workflow ${FIXTURES.ncrWorkflowName}`,
        })
        const submit = p.getByRole('button', { name: 'Create NC' })
        await expect(card.or(submit).first()).toBeVisible({ timeout: 45_000 })
        if (await card.isVisible().catch(() => false)) await card.click()
        await expect(submit, 'the card click should land on the details form').toBeVisible({
          timeout: 30_000,
        })
      },
    })
  })
})
