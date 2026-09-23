// PW-J12 · OQ-01 TC-01-01 (URS-DOC-01) — "Required fields are enforced at creation."
//
// WHAT THIS FILE ADDS OVER WHAT ALREADY EXISTED.
//
// PW-J1 proves the happy path (create → DRAFT 1.0 → no doc number). PW-J11
// proves that an entirely empty form is refused and writes nothing, and states
// in its header that "server-level proof of required-ness stays uncovered until
// someone writes a GraphQL-level probe". Neither closes TC-01-01, because the
// substance of the test case is not "the form complains" — it is WHICH LAYER
// refuses WHICH FIELD. The protocol's third blockquote note is explicit:
//
//   "Title is required by both the form and the database. Department, Sites and
//    Owner are required by the form only — each is nullable at the data layer —
//    so steps 3 and 4 demonstrate usability controls rather than data-integrity
//    ones: a write reaching the data layer directly is not refused."
//
// A suite that only drives the form records all four fields as equally
// "enforced", which is the false assurance that note exists to prevent. So each
// field is asserted TWICE: once at the form, once at the data layer through
// `sqlAsAppUser` — the untrusted `app_user` role with the same session GUCs a
// real GraphQL request carries, so RLS and every trigger are live and nothing
// is bypassed the way a Sequelize/REST superuser connection would bypass them.
// That IS the GraphQL-level probe J11 deferred, and the two answers differing
// is the evidence TC-01-01 actually asks for.
//
// Every data-layer write runs inside BEGIN … ROLLBACK, so this file leaves no
// rows behind; the UI arms are all refusals, so they leave none either.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, COMPANY_ID, FIXTURES } from '../fixtures/cast.js'
import { sql, sqlValue, sqlAsAppUser, findDocumentByTitle } from '../fixtures/db.js'
import { selectOption, uniqueTitle } from '../fixtures/documents.js'
import { VALIDATION_SUMMARY } from '../fixtures/negativeArms.js'

test.use({ storageState: AUTH.author })

const AUTHOR = { userId: USERS.author.id, companyId: COMPANY_ID }

/** Documents in the E2E tenant right now — the "nothing was written" oracle. */
function documentCount() {
  return Number(sqlValue(`SELECT count(*) FROM documents WHERE company_id = '${COMPANY_ID}'`))
}

/** Is this column declared nullable? The schema fact behind each arm below. */
function isNullable(column) {
  return sqlValue(
    `SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'documents' AND column_name = '${column}'`,
  )
}

/**
 * One INSERT into `documents` as the untrusted `app_user` role, rolled back.
 *
 * Deliberately NOT driven through the UI: the point is to reach the data layer
 * with the form's rules skipped, which is what a raw GraphQL mutation, an
 * import, or any future integration does. `sqlAsAppUser` is the only helper
 * that drops to `app_user`; Sequelize/REST connect as the superuser DB_USER and
 * bypass RLS and the triggers, so a probe through them would prove nothing.
 *
 * Values are interpolated rather than bound because psql -tA takes no bind
 * parameters. Every literal here is owned by this file.
 */
function insertDocumentAsAuthor(columns, values) {
  const cols = ['id', 'company_id', 'status_id', 'author_id', 'created_at', 'updated_at', ...columns]
  const vals = [
    'gen_random_uuid()',
    `'${COMPANY_ID}'`,
    "'ACTIVE'",
    `'${USERS.author.id}'`,
    'now()',
    'now()',
    ...values,
  ]
  return sqlAsAppUser(
    `BEGIN;\nINSERT INTO documents (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING id;\nROLLBACK;`,
    AUTHOR,
  )
}

/** The ValidationSummary panel BaseForm renders on a refused submit. */
function summary(page) {
  return page.getByRole('alert').filter({ hasText: VALIDATION_SUMMARY }).first()
}

/**
 * Fill the create form's Properties tab completely, then hand control back so
 * exactly ONE field can be emptied before submitting.
 *
 * Mirrors `createSopDocument`'s selector strategy but stops short of clicking
 * Create — the shared fixture must not learn a "leave a field out" mode for
 * this file's sake, so the walk is duplicated here rather than parameterised
 * there.
 *
 * Waits for the inherited approval flow as well as the prefix. Both are
 * derived from the template and arrive async, and Create Document is refused
 * without either — so waiting is what makes a refusal below attributable to the
 * field this test emptied rather than to a field that had not loaded yet.
 */
async function openFilledCreateForm(page, title) {
  await page.goto('/documents/create')
  await expect(page).toHaveURL(/\/documents\/create/)

  await selectOption(page, 'Document Template', FIXTURES.sopTemplateName)
  await page.getByPlaceholder('e.g. Clean Room Sterilization Protocol').fill(title)

  const allSites = page.getByLabel('All sites (company-wide)')
  if (!(await allSites.isChecked())) {
    await page.getByText('All sites (company-wide)', { exact: true }).click()
  }
  await expect(allSites).toBeChecked()

  // Readiness gate. The prefix is derived from the chosen template and arrives
  // async, so it is the cheapest proof that the template really resolved — a
  // refusal below is then attributable to the field this test emptied, not to a
  // field that had not loaded yet.
  await expect(page.getByLabel('Document Prefix')).toHaveValue(FIXTURES.sopTemplatePrefix, {
    timeout: 20_000,
  })

  // The approval flow is the slow half — `inheritedVersionId` is two live
  // queries deep, and until both land the Approval Flow card renders the
  // transient "This template has no approval flow yet". Retry the whole read
  // rather than one `toBeVisible`, which cannot recover from that state.
  await expect(async () => {
    await expect(
      page.getByText(FIXTURES.sopTemplateApprovalStep1, { exact: true }).first(),
    ).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 60_000 })
}

/** The Sites / Department / Owner control: first combobox after the label. */
function comboAfter(page, label) {
  return page
    .getByText(label, { exact: true })
    .first()
    .locator('xpath=following::*[@role="combobox"][1]')
}

test.describe('PW-J12 · TC-01-01 · mandatory metadata at document creation', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Step 2 — Title. The one field enforced at BOTH layers.
  // ─────────────────────────────────────────────────────────────────────────

  test('TC-01-01 step 2 · FORM: an otherwise-complete Create Document form with no Title is refused and names Document Title', async ({
    page,
  }) => {
    test.setTimeout(150_000)
    const before = documentCount()
    await openFilledCreateForm(page, uniqueTitle('J12-title'))

    // Empty the one field under test, leaving every other field as filled.
    await page.getByPlaceholder('e.g. Clean Room Sterilization Protocol').fill('')

    // "Create Document", NOT "Save as Draft" — protocol note two. The draft
    // path checks the title alone and would pass this step vacuously.
    await page.getByRole('button', { name: 'Create Document' }).click()

    await expect(summary(page), 'the submit is refused with a validation summary').toBeVisible({
      timeout: 15_000,
    })
    await expect(
      summary(page),
      'and the missing field is identified to the user by name, with a reason',
    ).toContainText('Document Title — Document Title is required.')
    await expect(page, 'a refused create does not navigate to a document').toHaveURL(
      /\/documents\/create/,
    )
    expect(documentCount(), 'a refused create writes no row').toBe(before)
  })

  test('TC-01-01 step 2 · DATA LAYER: title is NOT NULL — a direct write without it is REFUSED by Postgres', async () => {
    const res = insertDocumentAsAuthor(['title', 'user_id'], ['NULL', `'${USERS.author.id}'`])

    expect(res.ok, 'the data layer refuses a titleless document').toBe(false)
    expect(
      res.error,
      'and refuses it as a NOT NULL violation on documents.title, not as an RLS denial',
    ).toMatch(/null value in column "title".*violates not-null constraint/is)

    // The schema fact behind the refusal, asserted directly so a migration that
    // drops the constraint fails HERE rather than quietly turning the arm above
    // into an RLS test that happens to stay red for the wrong reason.
    expect(isNullable('title'), 'documents.title is declared NOT NULL').toBe('NO')
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3 — Sites. Form-only, exactly as the protocol's note three says.
  // ─────────────────────────────────────────────────────────────────────────

  test('TC-01-01 step 3 · FORM: clearing Sites is refused and names Sites', async ({ page }) => {
    test.setTimeout(150_000)
    const title = uniqueTitle('J12-sites')
    const before = documentCount()
    await openFilledCreateForm(page, title)

    // Untick company-wide. The multi-select underneath is NOT empty: the
    // "defaults from the author" watcher in DocumentsCreate seeds it with the
    // author's own site, which renders as a chip ("Primary Site"). Each chip
    // carries its own clear control — SiteSelectMenu leaves `required` false on
    // the multiple case — so the chips have to go before the field is unset.
    await page.getByText('All sites (company-wide)', { exact: true }).click()
    await expect(page.getByLabel('All sites (company-wide)')).not.toBeChecked()

    const sites = comboAfter(page, 'Sites')
    await expect(sites).toBeVisible({ timeout: 15_000 })
    // Bounded, retried: the author belongs to one site, so this is a single
    // pass in practice, but the seed could grow a second without this file
    // noticing, and a chip removal re-renders the trigger underneath.
    await expect(async () => {
      for (let i = 0; i < 6; i++) {
        const clear = sites.locator('button').first()
        if (!(await clear.isVisible().catch(() => false))) break
        await clear.click()
        await page.waitForTimeout(300)
      }
      await expect(sites, 'Sites is now genuinely empty').toHaveText(/select/i, { timeout: 5_000 })
    }).toPass({ timeout: 45_000 })

    await page.getByRole('button', { name: 'Create Document' }).click()

    await expect(summary(page)).toBeVisible({ timeout: 15_000 })
    await expect(
      summary(page),
      'the missing field is identified as Sites, with the reason',
    ).toContainText('Sites — Select at least one site, or choose All sites')
    expect(documentCount(), 'a refused create writes no row').toBe(before)
    expect(findDocumentByTitle(title), 'and specifically not this one').toBeNull()
  })

  test('TC-01-01 step 3 · DATA LAYER: site_id is nullable — a direct write with no site is ACCEPTED', async () => {
    // KNOWN DEFECT (protocol-acknowledged, TC-01-01 note three).
    // The protocol demands this be RECORDED rather than fixed — "Record this
    // distinction if your risk assessment relies on mandatory Department, Site
    // or Owner capture" — so this test pins the ACCEPTANCE rather than
    // asserting a refusal the product does not perform.
    //
    // What it means in practice: `documents.site_id` is nullable and
    // `document_sites` is a separate table with no "at least one row"
    // constraint, so any writer that is not this create form can produce a
    // document that applies to no site at all. Site applicability is therefore
    // a usability control, not a data-integrity one. If this arm ever goes RED,
    // site capture became a data-integrity control and TC-01-01 step 3 can be
    // upgraded from "interface control" to "enforced".
    const res = insertDocumentAsAuthor(
      ['title', 'site_id', 'user_id'],
      ["'J12 data-layer no-site'", 'NULL', `'${USERS.author.id}'`],
    )

    expect(
      res.ok,
      `the data layer ACCEPTS a document with no site — form-only control. stderr: ${res.error}`,
    ).toBe(true)
    expect(res.output, 'the INSERT reported one affected row before the rollback').toMatch(
      /INSERT 0 1/,
    )
    expect(isNullable('site_id'), 'documents.site_id is nullable').toBe('YES')
    expect(
      sqlValue(`SELECT count(*) FROM documents WHERE title = 'J12 data-layer no-site'`),
      'the rollback held — this probe leaves nothing behind',
    ).toBe('0')
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4 — Department. Form-only, and the form control cannot be emptied.
  // ─────────────────────────────────────────────────────────────────────────

  test('TC-01-01 step 4 · FORM: Department cannot be emptied — BaseSelect auto-fills a required single select, so the step is not executable as written', async ({
    page,
  }) => {
    test.setTimeout(150_000)
    // KNOWN DEFECT / protocol-vs-product divergence (name: DOC-REQ-01).
    // TC-01-01 step 4 reads "Omit the Department, then attempt to save → Save
    // is refused in the interface; the missing field is identified." THE STEP
    // IS NOT EXECUTABLE AS WRITTEN.
    //
    // DocumentsCreateProperties passes `:required="true"` to
    // DepartmentSelectMenu, which forwards it to BaseSelect. BaseSelect's
    // `autoFill` (default true) writes the first option into the model as soon
    // as the options load, and `:clearable="!props.required && !props.multiple"`
    // renders no clear control. `required` also suppresses the "— Select
    // department —" null row from the list entirely. So the state step 4
    // describes cannot be reached: the field refills itself.
    //
    // That is NOT the same as the field being enforced, and the difference is
    // the point of this test. It is enforced only while the user stays on this
    // one form — the data-layer arm below shows the column is nullable. What is
    // asserted here is the ACTUAL behaviour (pre-filled, unclearable), not a
    // refusal the product never performs.
    await openFilledCreateForm(page, uniqueTitle('J12-dept'))

    const department = comboAfter(page, 'Department')
    await expect(department).toBeVisible({ timeout: 15_000 })

    // Auto-fill resolved a real department, not the null label.
    await expect(department, 'a required single select arrives pre-filled').not.toHaveText(
      /select department/i,
      { timeout: 20_000 },
    )
    await expect(department, 'and the pre-filled value is non-empty').not.toHaveText(/^\s*$/)

    // No clear affordance, so "omit it" is unreachable through the interface.
    await expect(
      department.getByRole('button', { name: /clear/i }),
      'a required single select renders no clear control',
    ).toHaveCount(0)
  })

  test('TC-01-01 step 4 · DATA LAYER: department_id is nullable — a direct write with no department is ACCEPTED', async () => {
    // KNOWN DEFECT (protocol-acknowledged, note three). Same shape as site:
    // form-only control over a nullable column. Pinned as acceptance.
    const res = insertDocumentAsAuthor(
      ['title', 'department_id', 'user_id'],
      ["'J12 data-layer no-department'", 'NULL', `'${USERS.author.id}'`],
    )

    expect(
      res.ok,
      `the data layer ACCEPTS a document with no department — form-only control. stderr: ${res.error}`,
    ).toBe(true)
    expect(res.output).toMatch(/INSERT 0 1/)
    expect(isNullable('department_id'), 'documents.department_id is nullable').toBe('YES')
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Owner — protocol note four ("the form asks for … Owner. Both are required
  // on the Create Document path"). Same two layers.
  // ─────────────────────────────────────────────────────────────────────────

  test('TC-01-01 note 4 · FORM: Owner is asked for and pre-filled with the creator, and likewise cannot be emptied', async ({
    page,
  }) => {
    test.setTimeout(150_000)
    await openFilledCreateForm(page, uniqueTitle('J12-owner'))

    const owner = comboAfter(page, 'Owner')
    await expect(owner, 'the form does ask for an Owner').toBeVisible({ timeout: 15_000 })

    // DocumentsCreate seeds `ownerId` from the session, so the creator is the
    // default owner. That is how note four's "required on the Create Document
    // path" is satisfied in practice: by a default, never by stopping the user.
    await expect(owner, 'Owner defaults to the creating author').toContainText(USERS.author.name, {
      timeout: 20_000,
    })
    // KNOWN DEFECT / divergence, identical in shape to DOC-REQ-01 above:
    // `:required="true"` on UserSelectMenu means `:clearable="!required"`, so
    // there is no clear control and an "omit the Owner" refusal cannot be
    // demonstrated through the interface.
    await expect(
      owner.getByRole('button', { name: /clear/i }),
      'a required single select renders no clear control',
    ).toHaveCount(0)
  })

  test('TC-01-01 note 4 · DATA LAYER: user_id (Owner) is nullable — a direct write with no owner is ACCEPTED', async () => {
    // KNOWN DEFECT (protocol-acknowledged, note three). `documents.user_id` is
    // the Owner column; `author_id` is the separate, model-defaulted author, so
    // an ownerless document still has an author and looks unremarkable in a
    // listing.
    const res = insertDocumentAsAuthor(['title', 'user_id'], ["'J12 data-layer no-owner'", 'NULL'])

    expect(
      res.ok,
      `the data layer ACCEPTS an ownerless document — form-only control. stderr: ${res.error}`,
    ).toBe(true)
    expect(res.output).toMatch(/INSERT 0 1/)
    expect(isNullable('user_id'), 'documents.user_id (Owner) is nullable').toBe('YES')
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Step 6 — numbering is deferred to first submission.
  // ─────────────────────────────────────────────────────────────────────────

  test('TC-01-01 step 6 · no document number is assigned at creation — doc_number is nullable and no unsubmitted document carries one', async () => {
    // PW-J1 asserts `doc.docNumber === null` on the document it creates. This
    // arm generalises it to the whole tenant, which is the property that
    // matters for TC-01-02's "a draft deleted before it is ever submitted
    // consumes no number, and gaps are not expected from abandoned drafts": a
    // DRAFT-only document holding a number would be a burnt sequence number and
    // an auditable gap.
    expect(isNullable('doc_number'), 'documents.doc_number is nullable — numbering is deferred').toBe(
      'YES',
    )

    const numberedButNeverSubmitted = sqlValue(
      `SELECT count(*) FROM documents d
        WHERE d.company_id = '${COMPANY_ID}'
          AND d.doc_number IS NOT NULL
          AND d.deleted_at IS NULL
          AND NOT EXISTS (
                SELECT 1 FROM document_versions dv
                 WHERE dv.document_id = d.id
                   AND dv.deleted_at IS NULL
                   AND dv.status_id <> 'DRAFT')`,
    )
    expect(
      Number(numberedButNeverSubmitted),
      'no document holds a number while every one of its versions is still DRAFT',
    ).toBe(0)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5 — the positive path, and what it does NOT evidence.
  // ─────────────────────────────────────────────────────────────────────────

  test('TC-01-01 step 5 · a completed form saved with Create Document opens version 1.0 in Draft, with every captured field persisted', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    // PW-J1 already covers "create → DRAFT 1.0, no doc number". What this arm
    // adds is the rest of step 5's sentence: that the SIX fields the step
    // enumerates — document template, title, Sites, department, Owner and
    // prefix — are each actually persisted, not merely accepted by the form.
    // A required field that validates and is then dropped on the way to the
    // database looks identical from the screen, and is the failure mode a
    // metadata-capture requirement exists to catch.
    const title = uniqueTitle('J12-step5')
    await openFilledCreateForm(page, title)

    await page.getByRole('button', { name: 'Create Document' }).click()
    await expect(page, 'a complete form creates the document and opens it').toHaveURL(
      /\/documents\/(?!create)[0-9a-f-]{36}/,
      { timeout: 30_000 },
    )

    const doc = findDocumentByTitle(title)
    expect(doc, 'the document row exists').toBeTruthy()

    const row = sql(
      `SELECT coalesce(document_template_id::text, 'NULL'),
              coalesce(department_id::text, 'NULL'),
              coalesce(user_id::text, 'NULL'),
              coalesce(prefix, 'NULL'),
              applies_all_sites
         FROM documents WHERE id = '${doc.id}'`,
    ).split('|')
    expect(row[0], 'the chosen Document Template is persisted').not.toBe('NULL')
    expect(row[1], 'Department is persisted').not.toBe('NULL')
    expect(row[2], 'Owner is persisted, defaulted to the creating author').toBe(USERS.author.id)
    expect(row[3], 'the template prefix is persisted').toBe(FIXTURES.sopTemplatePrefix)
    expect(row[4], 'Sites was captured as company-wide, matching what was ticked').toBe('t')

    // "version 1.0 opens in Draft status" — read from the version row, not the
    // chip, because the chip is rendered from IndexedDB and can lag.
    const version = sql(
      `SELECT version_major || '.' || version_minor, status_id, is_latest
         FROM document_versions WHERE document_id = '${doc.id}' AND deleted_at IS NULL`,
    ).split('|')
    expect(version[0], 'version 1.0').toBe('1.0')
    expect(version[1], 'in Draft status').toBe('DRAFT')
    expect(version[2], 'and it is the latest version').toBe('t')

    // Step 6, on the document this step just made.
    expect(doc.docNumber, 'no document number is assigned at creation').toBeNull()
  })
})
