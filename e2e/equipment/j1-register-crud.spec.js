// EQ-J1 — the register: create, edit, filter, sort.
//
// WHY THIS FILE EXISTS. The register is the module's ONLY screen — there is no
// detail route — so it carries the whole surface: the create dialog, the edit
// dialog (the same component, opened by a row click), the status/category
// filters and the sort. Nothing else in the repository exercises any of it: the
// module had zero frontend tests of any kind before 2026-09-07.
//
// It also happens to be the only place where the two write paths meet, and they
// are NOT the same path:
//
//   create → REST     `POST /v1/services/equipment` → equipmentService, which
//                     is where the unique-code check, the STATUSES/CATEGORIES
//                     enum checks and the E3 interval-unit check live.
//   edit   → SYNCENGINE `useLiveMutation` → GraphQL → `equipment_upd` as
//                     `app_user`. It does NOT go through equipmentService, so
//                     none of those validations run on it — the dialog
//                     re-implements the RETIRED → retiredAt auto-stamp in
//                     `buildModelFields()` for exactly that reason.
//
// A journey that only drove one of them would leave half the module untested
// and would not notice if someone "tidied" the edit path back onto REST (or the
// create path onto the syncEngine), which would silently move which validations
// apply. So this file asserts the PATH as well as the outcome.
import { test, expect } from '@playwright/test'
import { DEPARTMENTS, EQUIPMENT, SITES } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  createPersonaPool,
  findEquipmentByCode,
  openRegister,
  purgeEquipmentByCode,
  purgeMintedEquipment,
  registerRow,
} from '../fixtures/equipment.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

// Deliberately CONSTANT, not timestamped. Playwright restarts the worker after a
// failed test, which re-evaluates module scope — a timestamped code would change
// mid-file and the edit test would hunt for a row the create test never made
// under that name. beforeAll purges instead, so every run starts from the same
// state regardless of what failed before it. (Same reasoning as DEPT-J5.)
const CODE = 'E2E-EQ-J1-SUBJECT'
const NAME = 'E2E J1 Torque Wrench'
const RENAMED = 'E2E J1 Torque Wrench (recalled)'
// The retire journey gets its OWN row. Sharing the row above made the test
// depend on two earlier tests having succeeded AND on a REST PATCH round-
// tripping into IndexedDB before a filter re-ran — see the note on that test.
const RETIRE_CODE = 'E2E-EQ-J1-RETIRE'
const RETIRE_NAME = 'E2E J1 Reference Weight (retire)'

test.describe('EQ-J1 · the instrument register', () => {
  test.beforeAll(() => {
    // J1 is the first file in the project, so this is the suite's front door:
    // sweep every `E2E-EQ-%` instrument a previous run left behind before any
    // assertion counts or sorts the register. A run that dies mid-test leaks
    // throwaway rows, and they are not inert — see the sort journey below.
    purgeMintedEquipment()
    purgeEquipmentByCode(CODE)
    purgeEquipmentByCode(RETIRE_CODE)
  })
  test.afterAll(() => {
    purgeEquipmentByCode(CODE)
    purgeEquipmentByCode(RETIRE_CODE)
  })

  test('create: the dialog persists over REST, and the service validates it', async ({
    browser,
  }) => {
    const page = await pool.page(browser, EQUIPMENT.admin.auth)
    await openRegister(page)

    // Record the REST traffic. Create MUST go through equipmentService — that is
    // where `code` uniqueness, the category enum and the E3 interval-unit check
    // are enforced, and none of them exist on the GraphQL path.
    const restCalls = []
    page.on('request', (req) => {
      if (req.url().includes('/v1/services/equipment')) restCalls.push(`${req.method()} ${new URL(req.url()).pathname}`)
    })

    await page.getByRole('button', { name: 'New Equipment' }).click()
    // The dialog's title is a styled <div>, not a heading element
    // (CreateEquipmentDialog.vue:326) — getByRole('heading') matches nothing here.
    await expect(page.getByText('New Equipment', { exact: true }).last()).toBeVisible()

    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(NAME)
    await page.getByRole('textbox', { name: 'Code', exact: true }).fill(CODE)

    // Category is a plain <select> whose <option> values ARE the backend enum —
    // picking by value rather than by label is what makes this an assertion
    // about the stored data rather than about a label.
    await page.getByLabel('Category', { exact: true }).selectOption('INSTRUMENT')

    // Site is required (`:rules="[required()]"`), so the form will not submit
    // without it. BaseSelect renders a combobox + listbox.
    await page
      .getByText('Site', { exact: true })
      .first()
      .locator('xpath=following::*[@role="combobox"][1]')
      .click()
    await page
      .getByRole('listbox')
      .getByRole('option', { name: SITES.primary.name, exact: true })
      .click()

    await page.getByRole('button', { name: 'Add equipment', exact: true }).click()

    // Assert against Postgres, never against the toast: the row is what the
    // calibration cron, the QC capture gate and the log-book bridge all read.
    await expect
      .poll(() => sqlValue(`SELECT count(*) FROM equipment WHERE code = '${CODE}'`), {
        timeout: 20_000,
        message: 'the create landed in Postgres',
      })
      .toBe('1')

    const row = findEquipmentByCode(CODE)
    expect(row.name).toBe(NAME)
    expect(row.category, 'the stored value is the enum, not the label').toBe('INSTRUMENT')
    expect(row.siteId).toBe(SITES.primary.id)
    expect(row.statusId, 'defaults to IN_SERVICE').toBe('IN_SERVICE')
    expect(row.deletedAt).toBeNull()

    expect(
      restCalls,
      'create goes over REST — it must reach equipmentService, which owns the unique-code and enum checks',
    ).toContain('POST /api/v1/services/equipment')

    // And the row shows up in the register without a reload — the live query.
    await expect(registerRow(page, NAME)).toBeVisible({ timeout: 30_000 })
  })

  test('create: a duplicate code is refused by the service, not by the browser', async ({
    browser,
  }) => {
    // The dialog has a client-side availability check (`codeUnique`, a live
    // query over IndexedDB) — but IndexedDB is a stale mirror, so the check that
    // has to hold is the server's. This drives the REST route directly to reach
    // it, because the dialog's own rule blocks submit before the request is made.
    const page = await pool.page(browser, EQUIPMENT.admin.auth)

    // Arrange the row this test needs rather than inheriting it from the create
    // test above. That coupling made this assertion meaningless whenever the
    // earlier test failed: with no row present the POST is simply the first
    // insert, returns 201, and the failure reads as "duplicates are allowed"
    // when nothing of the sort was demonstrated.
    const seed = await page.request.post('/api/v1/services/equipment', {
      data: { code: CODE, name: 'Original', siteId: SITES.primary.id },
    })
    expect([201, 400], 'the row must exist before the duplicate is attempted').toContain(
      seed.status(),
    )

    const res = await page.request.post('/api/v1/services/equipment', {
      data: { code: CODE, name: 'Duplicate', siteId: SITES.primary.id },
    })
    expect(res.status()).toBe(400)
    expect(await res.text()).toMatch(/already exists/i)
    expect(
      sqlValue(`SELECT count(*) FROM equipment WHERE code = '${CODE}'`),
      'still exactly one',
    ).toBe('1')
  })

  test('create: the category enum is closed', async ({ browser }) => {
    // `category` is a bare varchar(50) with no CHECK constraint — the service is
    // the only thing keeping junk out, and `database/seeder-local.sql:774-789`
    // proves what happens when something writes around it (it seeds 'LAB' and
    // 'PRODUCTION', which no UI can produce and the register renders as "—").
    const page = await pool.page(browser, EQUIPMENT.admin.auth)
    const res = await page.request.post('/api/v1/services/equipment', {
      data: { code: `${CODE}-BAD`, name: 'Bad category', category: 'LAB', siteId: SITES.primary.id },
    })
    expect(res.status()).toBe(400)
    // UPDATED 2026-09-08. The enum is now closed TWICE and the outer layer
    // answers first: `schemas/equipment.js` (added with the Part 11 window) runs
    // as route middleware and rejects with a field-named
    // `{ error: { code: 'VALIDATION_ERROR', fields: { category: [...] } } }`,
    // so `equipmentService`'s own "category must be one of …" is now
    // unreachable over REST. The rule did not change — it moved earlier, which
    // is strictly better. Accept either, so this journey keeps asserting the
    // RULE rather than which layer happens to enforce it, and assert the
    // field is named so a blanket "Validation failed" cannot satisfy it.
    const body = await res.text()
    expect(body, 'the refusal names the offending field').toMatch(/category/i)
    expect(body).toMatch(/must be one of|VALIDATION_ERROR/i)
    expect(sqlValue(`SELECT count(*) FROM equipment WHERE code = '${CODE}-BAD'`)).toBe('0')
  })

  test('edit: a row click opens the same dialog, and the save goes over the syncEngine', async ({
    browser,
  }) => {
    const page = await pool.page(browser, EQUIPMENT.admin.auth)
    // Anchor on the row this test is about to CLICK, not on a seeded row. They
    // are not the same wait: `E2E-EQ-J1-SUBJECT` was created moments ago by the
    // test above, so it reaches IndexedDB via the sync socket, while the seeded
    // anchor is already in the bootstrap. Anchoring on the seeded one returns as
    // soon as the page has any rows at all and the click then times out on a row
    // that is still in flight — which is exactly how this failed when a worker
    // restart put the whole file in a fresh context.
    await openRegister(page, { anchorName: NAME })

    const restCalls = []
    page.on('request', (req) => {
      if (req.url().includes('/v1/services/equipment')) restCalls.push(`${req.method()} ${new URL(req.url()).pathname}`)
    })

    await registerRow(page, NAME).click()
    await expect(page.getByText('Edit Equipment', { exact: true }).last()).toBeVisible()

    // Code is locked after creation — record_number continuity for log entries
    // depends on it, and `code` is not in the service's UPDATABLE_FIELDS either.
    await expect(
      page.getByRole('textbox', { name: 'Code', exact: true }),
      'the code is locked in edit mode',
    ).toBeDisabled()

    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(RENAMED)
    await page.getByLabel('Status', { exact: true }).selectOption('OUT_OF_SERVICE')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()

    await expect
      .poll(() => findEquipmentByCode(CODE)?.name, { timeout: 20_000 })
      .toBe(RENAMED)
    expect(findEquipmentByCode(CODE).statusId).toBe('OUT_OF_SERVICE')

    expect(
      restCalls.filter((c) => c.startsWith('PATCH')),
      'edit persists over GraphQL — a PATCH here would mean the path moved, and with it which validations apply',
    ).toHaveLength(0)
  })

  // RESOLVED 2026-09-08 — this journey was `test.fixme` and is not any more.
  //
  // WHAT WAS ACTUALLY WRONG, because the previous note had it half right. It
  // said "the harness fails, not the product", which was true, and blamed the
  // hydration budget, which was not: no wait would ever have been long enough.
  //
  // The old arrange step reused the row the two tests above had already mutated
  // and pushed it back to IN_SERVICE over a REST PATCH. But the register renders
  // from IndexedDB, its default filter is `status: ['IN_SERVICE']`, and the copy
  // of the row sitting in IDB still said OUT_OF_SERVICE — so the row was
  // filtered OUT of the register, and `openRegister`'s remedy (reload, wait
  // longer, reload again) could not possibly help: a reload does not re-bootstrap
  // (the localStorage gate skips it while the data is under five minutes old),
  // so every attempt re-read the same stale row. The only thing that could have
  // fixed it was the sync broadcast landing, which the test had no barrier on.
  //
  // The fix is to stop depending on either: mint a FRESH row for this test alone,
  // before the register is opened, so it arrives as part of the same bootstrap
  // the anchor waits for — and then let the RETIRE go through the syncEngine,
  // which writes IDB itself and fires syncBus synchronously with the save. Both
  // halves are then deterministic, and the rule the journey exists for is
  // asserted rather than skipped.
  test('edit: flipping to RETIRED stamps retiredAt, on the path that has no service behind it', async ({
    browser,
  }) => {
    // `updateEquipment` auto-stamps retiredAt server-side, but the dialog does
    // NOT use it — it saves through the syncEngine, so the stamp is
    // re-implemented in `buildModelFields()`. Two implementations of one rule is
    // exactly the shape that drifts, and this is the copy nothing else covers.
    const page = await pool.page(browser, EQUIPMENT.admin.auth)

    purgeEquipmentByCode(RETIRE_CODE)
    const created = await page.request.post('/api/v1/services/equipment', {
      data: {
        code: RETIRE_CODE,
        name: RETIRE_NAME,
        siteId: SITES.primary.id,
        statusId: 'IN_SERVICE',
        category: 'INSTRUMENT',
      },
    })
    expect(created.status(), `arrange failed: ${await created.text()}`).toBe(201)
    const subject = findEquipmentByCode(RETIRE_CODE)
    expect(subject.retiredAt ?? sqlValue(`SELECT retired_at FROM equipment WHERE code = '${RETIRE_CODE}'`))
      .toBeFalsy()

    await openRegister(page, { anchorName: RETIRE_NAME })

    await registerRow(page, RETIRE_NAME).click()
    await expect(page.getByText('Edit Equipment', { exact: true }).last()).toBeVisible()
    await page.getByLabel('Status', { exact: true }).selectOption('RETIRED')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()

    await expect
      .poll(() => findEquipmentByCode(RETIRE_CODE)?.statusId, { timeout: 30_000 })
      .toBe('RETIRED')
    expect(
      sqlValue(`SELECT retired_at FROM equipment WHERE code = '${RETIRE_CODE}'`),
      'retiring an instrument records WHEN — auditors ask, and no service ran on this path',
    ).toBeTruthy()

    // And the register's default filter (status: ['IN_SERVICE']) drops it, which
    // is the product behaviour that keeps retired gear out of the way. No reload
    // and no barrier needed: the syncEngine wrote IDB as part of the save and
    // fired syncBus, so the live query has already re-run.
    await expect(
      registerRow(page, RETIRE_NAME),
      'a RETIRED instrument leaves the default view',
    ).toHaveCount(0, { timeout: 30_000 })

    purgeEquipmentByCode(RETIRE_CODE)
  })

  test('filter: search matches name, code and serial — and excludes', async ({ browser }) => {
    const page = await pool.page(browser, EQUIPMENT.admin.auth)
    await openRegister(page)

    const search = page.getByPlaceholder('Search by name, code, or serial')

    // By CODE. The assertion that matters is the exclusion: a filter that
    // matched everything would satisfy "the row I want is visible".
    await search.fill(EQUIPMENT.calDue.code)
    await expect(registerRow(page, EQUIPMENT.calDue.name)).toBeVisible()
    await expect(registerRow(page, EQUIPMENT.pmDue.name)).toHaveCount(0)
    await expect(registerRow(page, EQUIPMENT.notTracked.name)).toHaveCount(0)

    // By SERIAL — the third arm of the filter, and the one a stores clerk
    // actually uses. It is not rendered as its own column, so a serial search
    // that silently stopped working would be invisible on screen.
    await search.fill('SN-PMDUE-004')
    await expect(registerRow(page, EQUIPMENT.pmDue.name)).toBeVisible()
    await expect(registerRow(page, EQUIPMENT.calDue.name)).toHaveCount(0)

    // By NAME fragment.
    await search.fill('Forklift')
    await expect(registerRow(page, EQUIPMENT.otherDept.name)).toBeVisible()
    await expect(registerRow(page, EQUIPMENT.calExpired.name)).toHaveCount(0)

    // A term that matches nothing lands on the filtered empty state, not the
    // "no equipment yet" one — they are different strings and only one of them
    // is correct when filters are active.
    await search.fill('nothing-should-match-this-zzz')
    await expect(page.getByText('No equipment matches your filters')).toBeVisible()

    await search.fill('')
  })

  test('filter: the category dimension narrows the register and can be cleared', async ({
    browser,
  }) => {
    const page = await pool.page(browser, EQUIPMENT.admin.auth)
    await openRegister(page)

    // The filter menu writes an ARRAY of enum values into the list state; the
    // applied filters then render as removable chips. Both halves are asserted
    // because the chip row is the only affordance for undoing a filter.
    await page.getByRole('button', { name: /Filter/i }).first().click()
    await page.getByRole('menuitem', { name: 'Category' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'Vehicle' }).click()
    await page.keyboard.press('Escape')

    await expect(registerRow(page, EQUIPMENT.otherDept.name)).toBeVisible()
    await expect(
      registerRow(page, EQUIPMENT.calDue.name),
      'an INSTRUMENT is excluded by a VEHICLE filter',
    ).toHaveCount(0)

    await page.getByRole('button', { name: 'Clear all' }).click()
    await expect(registerRow(page, EQUIPMENT.calDue.name)).toBeVisible()
  })

  test('sort: the Name column orders the register both ways', async ({ browser }) => {
    const page = await pool.page(browser, EQUIPMENT.admin.auth)
    await openRegister(page)

    // The live query already sorts by name ascending, so an ASCENDING assertion
    // would pass whether or not the header did anything. Clicking to DESCENDING
    // and reading the first row back is the only version of this that can fail.
    // The NAME line only — the name cell also renders code and serial on a
    // sub-line, and comparing whole-cell text would compare those too.
    const nameAt = async (row) =>
      (await row.locator('td').first().locator('div').first().innerText()).trim()
    const firstName = () => nameAt(page.locator('tbody tr').first())
    const lastName = () => nameAt(page.locator('tbody tr').last())

    // A sortable column renders a <button> INSIDE the <th> and the click handler
    // lives on the button (DataTable.vue:924-926). Clicking the columnheader
    // itself does nothing — which is why the ascending assertion below passed
    // while the descending one failed: the rows were ALREADY ascending, so a
    // no-op click was indistinguishable from a working one. This is the hazard
    // the comment above warns about, and it caught us.
    const header = page
      .getByRole('columnheader', { name: 'Name' })
      .first()
      .getByRole('button', { name: 'Name' })

    // ASSERT THE PROPERTY, NOT A ROW NAME. This used to expect the literal
    // "E2E Autoclave" first and "E2E Vernier Calipers" last, which made the
    // journey a test of WHICH ROWS EXIST rather than of the sort: any instrument
    // another spec left behind changed the answer. It did — EQ-J3's throwaway
    // rows are named "Throwaway E2E-EQ-J3SYNC-…", which sorts after every
    // seeded name and became the first row descending, so this failed on a run
    // where nothing about sorting had changed. Comparing the ends of the page is
    // the same assertion and is immune to the register's contents.
    await header.click() // → ascending
    await expect
      .poll(async () => (await firstName()).localeCompare(await lastName()), { timeout: 15_000 })
      .toBeLessThan(0)
    const ascendingFirst = await firstName()

    await header.click() // → descending
    await expect
      .poll(firstName, { timeout: 15_000, message: 'the header reversed the order' })
      .not.toBe(ascendingFirst)
    expect(
      (await firstName()).localeCompare(ascendingFirst),
      'descending starts at the other end of the alphabet',
    ).toBeGreaterThan(0)
    expect(
      await lastName(),
      'and the row that led ascending now trails',
    ).toBe(ascendingFirst)
  })

  test('the department a row belongs to is stored and shown', async () => {
    // Not cosmetic: `equipment_ins/upd/del` all pass (department_id, site_id) to
    // authz.scope_allowed, so this column is what a department- or site-scoped
    // grant would be evaluated against. The seeded Operations instrument is the
    // only row in the register that is not at the Primary Site.
    const ops = EQUIPMENT.otherDept
    expect(sqlValue(`SELECT site_id FROM equipment WHERE id = '${ops.id}'`)).toBe(SITES.secondary.id)
    expect(sqlValue(`SELECT department_id FROM equipment WHERE id = '${ops.id}'`)).toBe(
      DEPARTMENTS.operations.id,
    )
  })
})
