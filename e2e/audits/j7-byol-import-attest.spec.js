// PW-J7 · BYOL import goes EFFECTIVE immediately + license attestation (MTC-15).
//
// The import path is the one place a standard becomes usable without an approval
// cycle: "the customer is asserting the imported list IS their reference". That
// bypass is the assertion — v1.0 EFFECTIVE straight away, current_effective_
// version_id already pointing at it, no approval workflow anywhere, and the
// attestation user + timestamp stamped in the SAME transaction as the create.
//
// Two defects this journey found sit at the end of the file, both in the import
// DIALOG rather than the endpoint (the API-path test in between is the control
// that proves the backend parser is fine):
//   🔴 the dialog posts the CSV with format 'paste', so every clause is mangled;
//   🔴 the dialog reads the wrong key off the response, so a successful import
//      never opens the standard it created.
// The remaining test pins the per-tenant code-uniqueness 409, whose structured
// STANDARD_CODE_EXISTS body is what the FE's "archive the old one" confirm
// dialog is built on.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import {
  clauseCount,
  findStandardByCode,
  importStandard,
  openSelectInDialog,
  versionsOfStandard,
} from '../fixtures/audits.js'
import { sqlRow, waitForSqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

const CSV_HEADER =
  'clauseNumber,parentClauseNumber,title,questions,observations,expectedEvidence,peopleToInterview,description,guidance'
const CSV_BODY = [
  '"5",,"Leadership",,,,,,',
  '"5.1","5","Leadership and commitment","Is top management engaged?",,"Management review minutes","Top Management",,',
  '"5.2","5","Policy","Is the quality policy communicated?",,"Signed policy",,,',
].join('\n')

test.describe('PW-J7 · bring-your-own-licence import', () => {
  test('CSV import mints a v1.0 EFFECTIVE version and stamps the attestation', async ({ page }) => {
    test.setTimeout(180_000)

    const stamp = Date.now()
    const code = `E2E-J7-${stamp}`
    await page.goto('/audits?tab=standards')
    await page.getByRole('button', { name: 'Import (CSV)' }).click()
    await expect(page.getByRole('heading', { name: 'Import Audit Standard' })).toBeVisible({
      timeout: 20_000,
    })

    await page.getByPlaceholder('e.g. ISO-9001-INTERNAL').fill(code)
    await page
      .getByPlaceholder('e.g. ISO 9001:2015 — internal interpretation')
      .fill(`E2E J7 Import ${stamp}`)
    // CUSTOMER_LICENSED is the default and is what gates the attestation block.
    await expect(page.getByText('License attestation required.')).toBeVisible()
    await page
      .getByLabel('I confirm we hold a valid licence for the content being imported.')
      .check()
    await page
      .getByPlaceholder('e.g. ISO Online Browsing Platform subscription #…')
      .fill('E2E licence ref 12345')
    await page.locator('textarea').last().fill(`${CSV_HEADER}\n${CSV_BODY}`)

    await page.getByRole('button', { name: 'Import' }).click()
    // The dialog closing is the UI's only success signal today — see the 🔴 test
    // below for why it does not navigate to the new standard.
    await expect(page.getByRole('heading', { name: 'Import Audit Standard' })).toBeHidden({
      timeout: 60_000,
    })
    await waitForSqlValue(
      `SELECT count(*) FROM audit_standards WHERE company_id = '${COMPANY_ID}' AND code = '${code}'`,
      { timeoutMs: 30_000, label: 'imported standard row' },
    )

    const standard = findStandardByCode(code)
    expect(standard, 'imported standard exists').toBeTruthy()
    expect(standard.contentLicense).toBe('CUSTOMER_LICENSED')
    expect(standard.attestedAt, 'attestation timestamp stamped with the create').toBeTruthy()
    expect(
      sqlRow(
        `SELECT customer_license_attested_by FROM audit_standards WHERE id = '${standard.id}'`,
      )[0],
      'the importing user is the attester of record',
    ).toBe(USERS.author.id)

    const versions = versionsOfStandard(standard.id)
    expect(versions).toHaveLength(1)
    expect(versions[0].label).toBe('1.0')
    expect(versions[0].statusId, 'imports skip the approval workflow entirely').toBe('EFFECTIVE')
    expect(standard.currentEffectiveVersionId).toBe(versions[0].id)
    expect(standard.workflowVersionId, 'no approval workflow is attached by an import').toBeNull()

    // Clause parsing is asserted separately — the dialog mangles it today (see
    // the 🔴 test below); everything above is correct regardless.

    // Effective from the moment of import: it is immediately pickable as the
    // standard for a new audit.
    await page.goto('/audits?tab=instances')
    await page.getByRole('button', { name: 'New Audit' }).click()
    await expect(page.getByRole('heading', { name: 'New Audit' })).toBeVisible({ timeout: 20_000 })
    await openSelectInDialog(page, 'Standard')
    await expect(
      page.getByRole('listbox').getByRole('option', { name: `E2E J7 Import ${stamp}` }),
    ).toBeVisible({ timeout: 30_000 })
  })

  test('the API import parses the CSV: clause numbers and parent nesting survive', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    // The control for the 🔴 below: the same CSV, same endpoint, posted with
    // format 'csv' — the backend parser handles it correctly. Anything the UI
    // gets wrong is therefore the dialog's payload, not the parser.
    const code = `E2E-J7-API-${Date.now()}`
    const res = await importStandard(page.request, {
      code,
      name: `${code} api`,
      csv: `${CSV_HEADER}\n${CSV_BODY}`,
    })
    expect(res.ok(), `import → ${res.status()}`).toBeTruthy()

    const standard = findStandardByCode(code)
    const [version] = versionsOfStandard(standard.id)
    expect(clauseCount(version.id), 'three data rows, header not imported').toBe(3)
    const numbers = sqlRow(
      `SELECT string_agg(clause_number, ',' ORDER BY display_order) FROM audit_requirements
        WHERE audit_standard_version_id = '${version.id}' AND deleted_at IS NULL`,
    )[0]
    expect(numbers).toBe('5,5.1,5.2')
    const parented = sqlRow(`
      SELECT count(*) FROM audit_requirements child
        JOIN audit_requirements parent ON parent.id = child.parent_id
       WHERE child.audit_standard_version_id = '${version.id}' AND parent.clause_number = '5'`)
    expect(Number(parented[0]), 'both sub-clauses hang off clause 5').toBe(2)
  })

  test('🔴 the import dialog posts the CSV as free text, mangling every clause (FAILS TODAY)', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    // Found by the first full run of this suite, and the most damaging defect it
    // turned up. AuditStandardImportDialog offers exactly one format (the CSV
    // template) and `format` is even initialised to 'csv' — but its
    // reset-on-open watcher sets `format.value = 'paste'`, so every import the
    // product makes is posted as free text. parsePasteContent then falls into
    // its single-token branch (the rows start with `"`, which its
    // `[A-Za-z0-9]…` prefix regex rejects) and emits one clause per LINE,
    // numbered 1..N with the raw CSV line as the title — header row included.
    //
    // Net effect: the imported standard is garbage, it goes EFFECTIVE with no
    // approval, and it can be picked for a real audit — so an auditor walks
    // through clauses titled `"5.1","5","Leadership and commitment",…`.
    // Fix: drop that line from the watcher (the ref already defaults to 'csv').
    const stamp = Date.now()
    const code = `E2E-J7-UI-${stamp}`
    await page.goto('/audits?tab=standards')
    await page.getByRole('button', { name: 'Import (CSV)' }).click()
    await expect(page.getByRole('heading', { name: 'Import Audit Standard' })).toBeVisible({
      timeout: 20_000,
    })
    await page.getByPlaceholder('e.g. ISO-9001-INTERNAL').fill(code)
    await page
      .getByPlaceholder('e.g. ISO 9001:2015 — internal interpretation')
      .fill(`E2E J7 UI ${stamp}`)
    await page
      .getByLabel('I confirm we hold a valid licence for the content being imported.')
      .check()
    await page.locator('textarea').last().fill(`${CSV_HEADER}\n${CSV_BODY}`)
    await page.getByRole('button', { name: 'Import' }).click()

    await waitForSqlValue(
      `SELECT count(*) FROM audit_standards WHERE company_id = '${COMPANY_ID}' AND code = '${code}'`,
      { timeoutMs: 30_000, label: 'imported standard row' },
    )
    const standard = findStandardByCode(code)
    const [version] = versionsOfStandard(standard.id)
    const numbers = sqlRow(
      `SELECT string_agg(clause_number, ',' ORDER BY display_order) FROM audit_requirements
        WHERE audit_standard_version_id = '${version.id}' AND deleted_at IS NULL`,
    )[0]
    expect(numbers, 'the CSV template must import as CSV — clause numbers, not line numbers').toBe(
      '5,5.1,5.2',
    )
  })

  test('🔴 the import dialog does not open the standard it just created (FAILS TODAY)', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    // The controller responds { standard, version, importedClauseCount }, but
    // AuditStandardImportDialog emits `created` with `res?.auditStandard` —
    // always undefined — and AuditStandardsHome only navigates when the payload
    // has an id. So a successful import silently drops the user back on the list
    // with no way to reach the new standard except finding it in the table.
    // One-word fix in the dialog: `res?.standard`.
    const stamp = Date.now()
    const code = `E2E-J7-NAV-${stamp}`
    await page.goto('/audits?tab=standards')
    await page.getByRole('button', { name: 'Import (CSV)' }).click()
    await expect(page.getByRole('heading', { name: 'Import Audit Standard' })).toBeVisible({
      timeout: 20_000,
    })
    await page.getByPlaceholder('e.g. ISO-9001-INTERNAL').fill(code)
    await page
      .getByPlaceholder('e.g. ISO 9001:2015 — internal interpretation')
      .fill(`E2E J7 Nav ${stamp}`)
    await page
      .getByLabel('I confirm we hold a valid licence for the content being imported.')
      .check()
    await page.locator('textarea').last().fill(`${CSV_HEADER}\n${CSV_BODY}`)
    await page.getByRole('button', { name: 'Import' }).click()

    await waitForSqlValue(
      `SELECT count(*) FROM audit_standards WHERE company_id = '${COMPANY_ID}' AND code = '${code}'`,
      { timeoutMs: 30_000, label: 'imported standard row' },
    )
    const standard = findStandardByCode(code)
    await expect(
      page,
      'a successful import must land the user on the standard it created',
    ).toHaveURL(new RegExp(`/audits/standards/${standard.id}`), { timeout: 30_000 })
  })

  test('a duplicate code is refused with a structured 409', async ({ page }) => {
    test.setTimeout(120_000)
    const code = `E2E-J7-DUP-${Date.now()}`
    const csv = `${CSV_HEADER}\n${CSV_BODY}`

    const first = await importStandard(page.request, { code, name: `${code} first`, csv })
    expect(first.ok(), `first import → ${first.status()}`).toBeTruthy()

    const second = await importStandard(page.request, { code, name: `${code} second`, csv })
    expect(second.status(), 'per-tenant code uniqueness is enforced').toBe(409)
    const body = await second.json().catch(() => null)
    expect(body?.error?.code, 'structured code the FE dialog branches on').toBe(
      'STANDARD_CODE_EXISTS',
    )
    expect(body?.error?.details?.existingStandardCode).toBe(code)
  })
})
