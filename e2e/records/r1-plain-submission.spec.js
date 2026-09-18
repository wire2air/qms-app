// REC-J1 — a plain submission, end to end through the App Builder, in a browser.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A BROWSER JOURNEY AND NOT ANOTHER REST PROBE
//
// The other files in this project talk to Postgres and to the API directly,
// because the properties they pin (the QMSMR guard, the scope tiers, the
// namespace dispatch) live below the UI and are invisible from it. This one is
// the opposite: three of the four things it asserts were only ever observable
// in a browser, and all three shipped broken for the life of the feature.
//
//   F-11  `AddRecordDialog.vue` minted `<CODE>-NNNN` IN THE BROWSER — read every
//         RecordCounter out of IndexedDB, `currentValue += 1`, then saved the
//         record and the counter as two separate round trips. The number an
//         auditor traces was invented client-side, off a cache only as fresh as
//         the last sync push. It now POSTs to /v1/services/records.
//   F-15  `records.document_type_id` was never written by ANY create path, so
//         the DOCUMENT TYPE column in this very table — and the advanced filter
//         keyed on it — were permanently blank for every record ever made.
//   F-13  the Approve / Unapprove menu, the ONLY affordance in the product that
//         writes `records.status_id`, was offered to every user who could see
//         the table with no permission check at all. The write goes out over
//         GraphQL as `app_user`, where `record_update_rls` requires
//         `records:update` — so a user without it was shown a menu item whose
//         only possible outcome was a failed save.
//
// The fourth is the seal: this create is also where a plain submission freezes
// `form_schema` and `template_version`. A plain record differs from a module
// record in that it arrives COMPLETE — the INSERT is its submission — so
// without the freeze, editing the template later retroactively changes what an
// existing submission is deemed to have reported.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO-SIDED, IN THE FORM THIS LAYER ALLOWS
//
// F-13's assertion is an absence, and an absence is the easiest thing in a
// browser to assert for the wrong reason — an unrendered table, a slow live
// query and a correctly hidden menu look identical. So the menu test pairs two
// personas who both fully render the SAME table with the SAME row in it:
// `author` (records:create/read/update/delete) must SEE the menu, and
// `controller` (records:read only) must not. The row's presence is asserted for
// both before the menu is looked for, so "no menu" can never be "no row".
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS MEASURED (app-db, 2026-09-01)
//
// The probe template is provisioned by e2e/fixtures/records.js with
// `document_type_id = 'FORM'`. That is not incidental: every template the E2E
// tenant seeded carries a NULL document type, and against a NULL-typed template
// the F-15 fix and the F-15 defect produce the identical (blank) result. The
// column can only be shown to work by a template that has one.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlAsAppUser, waitForSqlValue } from '../fixtures/db.js'
import {
  RECORDS,
  affectedRows,
  createPersonaPool,
  createProbeRecord,
  deleteProbeRecords,
  findRecord,
  provisionRecordsFixtures,
  purgeProbeRecords,
  uniqueTag,
} from '../fixtures/records.js'

const T = RECORDS.plain
// A row created directly, for the menu-gate test: that test is about which
// controls render, and driving the dialog again would make it depend on the
// create journey passing first.
const MENU_ROW = 'e2e6f600-0000-4000-8000-000000000001'
const REGISTER_ROW = 'e2e6f600-0000-4000-8000-000000000002'

const pool = createPersonaPool()

test.beforeAll(() => {
  provisionRecordsFixtures()
  // Both register rows are created BEFORE any page is opened, and that ordering
  // is load-bearing rather than tidy.
  //
  // The SyncEngine's `bootstrapGate` skips a re-bootstrap when the local data is
  // under five minutes old, so the second `page.goto` in a REUSED context does
  // not re-sync. A row inserted by raw SQL between two navigations therefore has
  // exactly one way in — the live socket push — and that event fires while the
  // page is mid-navigation and its socket is not yet attached, so it is missed.
  // Measured: a row created inside the test body was still absent from the
  // register after 60 s, while the identical row created before the context's
  // FIRST load appeared every time. Creating them here puts both inside the
  // initial bootstrap, where nothing can race them.
  for (const [id, number] of [
    [MENU_ROW, `${T.code}-9999`],
    [REGISTER_ROW, `${T.code}-9998`],
  ]) {
    createProbeRecord({ id, templateId: T.templateId, moduleKey: null, userId: USERS.author.id })
    // A directly-inserted row carries no number — `createProbeRecord` does not
    // mint one, because minting is the server's job and REC-J7 is where that is
    // under test — and the register keys on it.
    sql(`
      UPDATE records
         SET record_number = '${number}', document_type_id = '${T.documentTypeId}'
       WHERE id = '${id}'`)
  }
})
test.afterAll(async () => {
  await pool.close()
  deleteProbeRecords([MENU_ROW, REGISTER_ROW])
  purgeProbeRecords([T.templateId])
})

/**
 * Open the App Builder Submissions tab and wait for it to be genuinely usable.
 *
 * The readiness signal is the Add Submission BUTTON, not the page load: the tab
 * itself renders from a permission check that resolves off the session, while
 * everything it lists comes out of IndexedDB after the SyncEngine bootstrap —
 * and a bootstrap on an idle machine takes ~17 s, longer while trace and video
 * are recording. Asserting against the shell would be asserting against an
 * empty table. One reload retry, because a reload restarts the bootstrap from
 * scratch and a tight retry loop can spin forever on a page that would have
 * been ready had it been left alone.
 */
async function openSubmissions(page, { expectCreate = true } = {}) {
  for (const budget of [60_000, 45_000]) {
    await page.goto('/records?tab=submissions')
    const anchor = expectCreate
      ? page.getByRole('button', { name: 'Add Submission' }).first()
      : page.getByRole('heading', { name: 'App Builder' }).first()
    const ready = await anchor
      .waitFor({ state: 'visible', timeout: budget })
      .then(() => true)
      .catch(() => false)
    if (ready) return
  }
  throw new Error('the App Builder Submissions tab never became ready')
}

test.describe('REC-J1 — plain submission through the App Builder', () => {
  test('fill and submit a form: the server mints the number and seals the schema', async ({
    browser,
  }) => {
    const page = await pool.page(browser, AUTH.author)
    const subject = uniqueTag('REC-J1')

    await openSubmissions(page)
    await page.getByRole('button', { name: 'Add Submission' }).first().click()

    // Narrow by search first: the picker unions log books and every ACTIVE
    // non-BLOCK template in the tenant, and clicking by title alone would be a
    // different test on a machine where another suite has added a template.
    await page.getByPlaceholder('Search templates...').fill(T.title)
    const card = page.getByLabel(`Select template ${T.title}`)
    await card.waitFor({ state: 'visible', timeout: 60_000 })
    await card.click()

    // The two fields of the probe schema, keyed by the LABEL the product
    // renders — the same convention the inspections suite uses.
    await page.getByLabel('Probe Subject').first().fill(subject)
    await page.getByLabel('Probe Note').first().fill('REC-J1 end-to-end')

    // ── F-11, asserted at the wire rather than at the screen ───────────────
    // Watching the request is a STRONGER statement of "the server mints the
    // number" than reading it off the dialog: the old client path never issued
    // this call at all — it wrote the record and the counter through the
    // SyncEngine — so the existence of a `POST /v1/services/records` whose
    // RESPONSE carries the number is itself the fix. Reading a number the
    // browser rendered could not distinguish the two, because a client-minted
    // number is displayed just as happily.
    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/v1/services/records') && r.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.getByRole('button', { name: 'Save Record' }).click(),
    ])
    expect(createResponse.status(), 'the browser POSTs the submission to the server').toBe(201)

    const sent = createResponse.request().postDataJSON()
    expect(
      Object.keys(sent).sort(),
      'and it sends only the template and the answers — there is no field for a number',
    ).toEqual(['payload', 'templateId'])
    const returned = (await createResponse.json())?.record

    // ── The dialog closes rather than showing its success step ─────────────
    // REC-N2, a real (minor) UI gap, asserted as it behaves today: the dialog
    // sets `step = 'success'` and THEN emits `created`, and the Submissions
    // tab's handler answers that by setting `showAddDialog = false` — which
    // unmounts the dialog before its success step can paint. So the "Record
    // Created! / Record number: …" screen is unreachable from this entry point
    // and the submitter is never shown the number their submission was filed
    // under. Reported, not patched. When the ordering is fixed this assertion
    // should fail, and that failure is the signal to rewrite it.
    await expect(
      page.getByText('Record Created!'),
      'REC-N2: the success step never paints — the parent closes the dialog on `created`',
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Add Submission' }).first(),
      'the dialog is gone and the register is back',
    ).toBeVisible({ timeout: 30_000 })

    // ── The row, from the database ─────────────────────────────────────────
    const id = await waitForSqlValue(
      `SELECT id FROM records WHERE payload->>'probeSubject' = '${subject}'`,
      { timeoutMs: 30_000, label: 'the submission reached the database' },
    )
    const row = findRecord(id)

    // The number the SERVER returned is the number that was stored. A client
    // that invented one and posted it would break this pair.
    expect(row.recordNumber, 'the response and the stored row agree').toBe(returned.recordNumber)
    expect(row.recordNumber, 'and it is in this template’s own sequence').toMatch(
      new RegExp(`^${T.code}-\\d{4}$`),
    )

    expect(row.companyId, 'it landed in the E2E tenant').toBe(COMPANY_ID)
    expect(row.moduleKey, 'and in the PLAIN namespace — no module_key').toBeNull()
    expect(row.statusId, 'created DRAFT, per the guard’s INSERT arm').toBe('DRAFT')
    expect(row.userId, 'attributed to the person who filled it in').toBe(USERS.author.id)
    expect(row.templateId).toBe(T.templateId)

    // F-15: the template's document type, denormalised onto the submission.
    // Blank for every record ever created before this fix.
    expect(
      row.documentTypeId,
      'DOCUMENT TYPE is written from the template (F-15) — not left null',
    ).toBe(T.documentTypeId)

    // The seal.
    expect(row.formSchemaLength, 'form_schema is frozen at submission').toBe(T.fields.length)
    expect(row.templateVersion, 'and the template version with it').not.toBeNull()
  })

  test('the submission appears in the register, with the columns that used to be blank', async ({
    browser,
  }) => {
    // Reads the row `beforeAll` created, NOT the one the previous test submitted.
    // Playwright starts a fresh worker after a failed test and runs this file's
    // `afterAll` on the way out, which purges the probe template — so a test
    // that leans on its predecessor's row fails with a misleading "the record
    // does not exist" and buries the real first failure. (Measured: exactly what
    // happened on this file's first run.)
    const page = await pool.page(browser, AUTH.author)
    const row = findRecord(REGISTER_ROW)

    await openSubmissions(page)

    // The register row itself, found by the number the server minted.
    const cell = page.getByText(row.recordNumber, { exact: false }).first()
    await expect(cell, 'the submission is listed in the Submissions register').toBeVisible({
      timeout: 60_000,
    })

    // CREATED BY (F-14) bound `row.user`, a relation that does not exist —
    // SyncEngine models are flat and `models/record.js` declares scalar FKs
    // only, so the column was structurally `undefined` and rendered `-` for
    // every row that has ever existed, exports included. It is resolved from
    // `userId` now.
    const tableRow = page.getByRole('row').filter({ hasText: row.recordNumber }).first()
    await expect(
      tableRow,
      'CREATED BY shows the submitter’s name, not a dash (F-14)',
    ).toContainText(USERS.author.name.split(' ')[0], { timeout: 30_000 })

    // DOCUMENT TYPE, the rendered half of F-15.
    await expect(tableRow, 'and DOCUMENT TYPE is populated (F-15)').not.toContainText('—')
  })

  test('F-13 — the Approve menu renders for records:update and for nobody else', async ({
    browser,
  }) => {
    // ── Leg 1: the holder. Establishes that the menu renders at all, which is
    // what leg 2's absence is measured against.
    const authorPage = await pool.page(browser, AUTH.author)
    await openSubmissions(authorPage)
    const authorRow = authorPage.getByRole('row').filter({ hasText: `${T.code}-9999` }).first()
    await expect(authorRow, 'the row is on screen for the update holder').toBeVisible({
      timeout: 60_000,
    })
    await expect(
      authorRow.getByRole('button', { name: 'More actions' }),
      'records:update sees the row menu',
    ).toBeVisible()
    await authorRow.getByRole('button', { name: 'More actions' }).click()
    await expect(
      authorPage.getByRole('menuitem', { name: 'Approve' }),
      '…and it offers Approve on a DRAFT record',
    ).toBeVisible()
    await authorPage.keyboard.press('Escape')

    // ── Leg 2: the reader. `controller` holds records:read at tenant scope and
    // no write verb — she renders the identical table, with the identical row,
    // and no menu. Asserting the ROW first is what makes the absent menu mean
    // something: an unrendered table would otherwise pass this test.
    const readerPage = await pool.page(browser, AUTH.controller)
    await openSubmissions(readerPage, { expectCreate: false })
    const readerRow = readerPage.getByRole('row').filter({ hasText: `${T.code}-9999` }).first()
    await expect(readerRow, 'the read-only persona sees the same row').toBeVisible({
      timeout: 60_000,
    })
    await expect(
      readerRow.getByRole('button', { name: 'More actions' }),
      'a user without records:update is offered no status affordance at all (F-13)',
    ).toHaveCount(0)

    // …and she is not merely being shown a disabled control: the write itself
    // is refused at the policy layer, which is the reason the menu is hidden
    // rather than a second, independent gate.
    const attempt = sqlAsAppUser(
      `UPDATE records SET status_id = 'APPROVED' WHERE id = '${MENU_ROW}' RETURNING id;`,
      { userId: USERS.controller.id, companyId: COMPANY_ID },
    )
    expect(attempt.ok, 'the refusal is a silent zero-row filter, not an error').toBeTruthy()
    expect(
      affectedRows(attempt),
      'record_update_rls does not admit a records:read holder',
    ).toBe(0)
    expect(findRecord(MENU_ROW).statusId, 'the record is untouched').toBe('DRAFT')
  })
})
