// PW-J10 · CR required-field refusals — the negative half of OQ-05 TC-05-01.
//
// WHY THIS FILE EXISTS. `createCr` always fills every field correctly, so
// nothing asserted that a change request *cannot* be raised without a change
// type, a priority, a site, a department, an owner or an initiation date.
// OQ-05 TC-05-01 asks for exactly those refusals and had zero coverage across
// nine CR spec files — the reason that test case scored PARTIAL.
//
// Client vs server: ChangeRequestsCreate.vue declares `:rules="[required()]"`
// per field and BaseForm renders its ValidationSummary on submit — a CLIENT
// gate a raw client skips. The gate that holds is `createChangeRequestSchema`
// on POST /v1/services/changeRequests, so the per-field arms are REST and the
// UI gets one arm proving the user is told what is missing.
//
// NOTE the schema is `.strict()`. An unlisted key rejects the WHOLE body with
// an unnamed "Validation failed" rather than naming the field — which is how a
// historical `notifyEmails` outage happened (see the route's own doc comment).
// So the control body below carries exactly the declared keys and nothing else;
// adding a stray key here would make every arm 400 for the wrong reason and the
// whole file would pass while proving nothing.
import { test, expect } from '@playwright/test'
import { DateTime } from 'luxon'
import { AUTH, USERS, SITES, DEPARTMENTS, FIXTURES } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { uniqueTitle } from '../fixtures/changeRequests.js'
import {
  expectEmptyFormRefused,
  expectMissingFieldRefused,
  expectValidBodyAccepted,
} from '../fixtures/negativeArms.js'

function publishedCrWorkflowVersion() {
  return sqlValue(`
    SELECT wv.id
      FROM workflow_versions wv
      JOIN workflows w ON w.id = wv.workflow_id
     WHERE w.name = '${FIXTURES.crWorkflowName}'
       AND wv.status_id = 'PUBLISHED'
     ORDER BY wv.created_at DESC
     LIMIT 1`)
}

function crCount() {
  return Number(sqlValue(`SELECT count(*) FROM change_requests`))
}

function findCrByTitle(title) {
  return sqlValue(`SELECT id FROM change_requests WHERE title = '${title}' LIMIT 1`)
}

/**
 * A body that really does create a CR. Every negative arm is this minus one
 * key, so the control test has to pass or the whole file is theatre.
 *
 * `initiatedAt` is a DATE, not a timestamp — the schema's ISO_DATE regex wants
 * 'YYYY-MM-DD'. A full ISO datetime here 400s for the wrong reason.
 */
function validCrBody(title) {
  return {
    title,
    changeTypeId: 'PROCESS',
    priorityId: 'MEDIUM',
    siteId: SITES.primary.id,
    departmentId: DEPARTMENTS.quality.id,
    ownerId: USERS.author.id,
    initiatedAt: DateTime.now().toISODate(),
    workflowVersionId: publishedCrWorkflowVersion(),
  }
}

// The schema's required set. `workflowVersionId` is deliberately ABSENT — it is
// `.optional()` server-side even though the UI makes it mandatory, and the arm
// below pins that gap rather than pretending it is a required field.
const REQUIRED_KEYS = [
  'title',
  'changeTypeId',
  'priorityId',
  'siteId',
  'departmentId',
  'ownerId',
  'initiatedAt',
]

test.describe('PW-J10 · CR required-field refusals', () => {
  test.use({ storageState: AUTH.author })

  test('control: the body every negative arm is derived from is accepted', async ({ browser }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const title = uniqueTitle('J10-control')

    await expectValidBodyAccepted(ctx, { path: '/changeRequests', validBody: validCrBody(title) })

    const id = findCrByTitle(title)
    expect(id, 'the control body created a real change request').toBeTruthy()

    sql(`DELETE FROM change_requests WHERE id = '${id}'`)
    await ctx.close()
  })

  for (const key of REQUIRED_KEYS) {
    test(`REST: creating a CR without '${key}' is refused 400 and writes nothing`, async ({
      browser,
    }) => {
      test.setTimeout(60_000)
      const ctx = await browser.newContext({ storageState: AUTH.author })

      await expectMissingFieldRefused(ctx, {
        path: '/changeRequests',
        validBody: validCrBody(uniqueTitle(`J10-no-${key}`)),
        omit: key,
        countRows: crCount,
      })

      await ctx.close()
    })
  }

  // ── known-gap ────────────────────────────────────────────────────────────
  // NOT a coverage arm. Do not tag this to a URS requirement: it pins current
  // behaviour that contradicts the UI, so tagging it would trace a protocol's
  // expected-pass step to a test asserting the opposite.
  //
  // The UI cannot create a CR without a workflow — screen 1 of the wizard is
  // mandatory and `WorkflowVersionSelect` gates the advance. But
  // `createChangeRequestSchema` declares `workflowVersionId` as
  // `.uuid().nullable().optional()`, so REST accepts a workflow-less CR that no
  // user could produce through the app. Unlike NC's draft route (deliberately
  // partial, documented as such) nothing records this as intended.
  //
  // If it is intended, delete this test and say so in the schema. If it is not,
  // make the key required and this test flips to a normal arm.
  test('known-gap: REST accepts a CR with no workflow, which the UI never allows', async ({
    browser,
  }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const title = uniqueTitle('J10-nowf')

    const body = validCrBody(title)
    delete body.workflowVersionId

    const res = await ctx.request.post('/api/v1/services/changeRequests', { data: body })
    expect(
      res.ok(),
      `workflowVersionId is schema-optional today, so this is accepted (${res.status()})`,
    ).toBe(true)

    const id = findCrByTitle(title)
    expect(id, 'a workflow-less CR was written').toBeTruthy()
    sql(`DELETE FROM change_requests WHERE id = '${id}'`)

    await ctx.close()
  })

  test('UI: submitting an empty create form tells the user what is missing', async ({ page }) => {
    test.setTimeout(120_000)

    await expectEmptyFormRefused(page, {
      createPath: '/change-requests/create',
      // NOT 'Create CR' — the button says Create Draft.
      submitLabel: 'Create Draft',
      countRows: crCount,
      // Workflow-first wizard, same shape as CAPA: clicking the card fires
      // `@pick="goToDetails"` and advances by itself. Screen 1 also carries a
      // redundant Continue button that CAPA/NC lack — ignore it; clicking the
      // card is the whole advance. With one active CHANGE_CONTROL workflow
      // screen 1 auto-skips entirely.
      async reach(p) {
        const card = p.getByRole('button', { name: `Select workflow ${FIXTURES.crWorkflowName}` })
        const submit = p.getByRole('button', { name: 'Create Draft' })
        await expect(card.or(submit).first()).toBeVisible({ timeout: 45_000 })
        if (await card.isVisible().catch(() => false)) await card.click()
        await expect(submit, 'the card click should land on the details form').toBeVisible({
          timeout: 30_000,
        })
      },
    })
  })
})
