// TRN-J9 · Training required-field refusals — the negative half of OQ-02 TC-02-01.
//
// ONE ARM, AND THAT IS THE WHOLE STORY. `POST /v1/services/trainings` carries
// NO zod schema. The controller hand-checks one thing:
//
//     if (!title?.trim()) throw new BadRequestError('title is required')
//
// Everything else — description, instructions, completionDueDays, passingScore,
// maxAttempts, requireManagerVerification, managerId, the assessment itself,
// roleIds, userIds, documentIds, externalLinks — is optional with no validation
// at all, because a training starts as a bare DRAFT shell you flesh out
// afterwards. That is the same deliberate permissiveness as NC's draft route.
//
// So DO NOT add a REQUIRED_KEYS loop here. Every one of those keys returns 2xx
// when omitted, and an arm asserting refusal would be asserting against a
// documented design decision — a test that is wrong while green.
//
// OQ-02 TC-02-01 asks for an assessment with a passing score and materials at
// authoring time. The product does not require them at create. That is a
// protocol-vs-product gap to record in the execution summary, not a gap to
// paper over with a test the schema contradicts.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import {
  expectEmptyFormRefused,
  expectMissingFieldRefused,
  expectValidBodyAccepted,
} from '../fixtures/negativeArms.js'

function uniqueTitle(tag) {
  return `E2E ${tag} ${Date.now()}`
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
function trainingCount() {
  return Number(
    sqlValue(`SELECT count(*) FROM trainings WHERE company_id = '${COMPANY_ID}'`),
  )
}

function findTrainingByTitle(title) {
  return sqlValue(`SELECT id FROM trainings WHERE title = '${title}' LIMIT 1`)
}

/**
 * Title is the only thing the CONTROLLER insists on — but not the only thing
 * the write needs.
 *
 * `Training.assessment` is `allowNull: false` with `defaultValue: []`, and this
 * controller passes the body straight through, so the default never applies and
 * Sequelize refuses with "Training.assessment cannot be null". A bare
 * `{ title }` therefore 400s — which is exactly what the control test caught,
 * while the title-refusal arm below was passing for the wrong reason.
 *
 * Worth knowing rather than papering over: the required surface is split across
 * two layers — a hand-check in the controller and a NOT NULL in the model — and
 * the route's own doc comment mentions only the first.
 */
function validTrainingBody(title) {
  return { title, assessment: [] }
}

test.describe('TRN-J9 · Training required-field refusals', () => {
  test.use({ storageState: AUTH.trainingAdmin })

  test('control: the body the negative arm is derived from is accepted', async ({ browser }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const title = uniqueTitle('J9-control')

    await expectValidBodyAccepted(ctx, {
      path: '/trainings',
      validBody: validTrainingBody(title),
    })

    const id = findTrainingByTitle(title)
    expect(id, 'a title alone creates a real training').toBeTruthy()

    sql(`DELETE FROM trainings WHERE id = '${id}'`)
    await ctx.close()
  })

  test("REST: creating a training without 'title' is refused 400 and writes nothing", async ({
    browser,
  }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.trainingAdmin })

    await expectMissingFieldRefused(ctx, {
      path: '/trainings',
      validBody: validTrainingBody(uniqueTitle('J9-no-title')),
      omit: 'title',
      countRows: trainingCount,
      messageMatches: /title/i,
    })

    await ctx.close()
  })

  test("REST: a whitespace-only title is refused too, not trimmed into existence", async ({
    browser,
  }) => {
    // The check is `!title?.trim()`, so '   ' must refuse exactly like an
    // absent key. Worth pinning separately: a future move to a zod
    // `z.string().min(1)` would accept '   ' and this is the only test that
    // would notice.
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const before = trainingCount()

    const res = await ctx.request.post('/api/v1/services/trainings', { data: { title: '   ' } })
    expect(res.status(), 'a blank-but-present title is still no title').toBe(400)
    expect(trainingCount(), 'nothing was written').toBe(before)

    await ctx.close()
  })

  test('UI: submitting an empty create form tells the user what is missing', async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const page = await ctx.newPage()

    // No wizard, no picker — Title and Description on one BaseForm. The client
    // declares `required()` on Title independently of the server's hand-check,
    // so this arm is still worth having.
    await expectEmptyFormRefused(page, {
      createPath: '/trainings/create',
      submitLabel: 'Create Training',
      countRows: trainingCount,
    })

    await ctx.close()
  })
})
