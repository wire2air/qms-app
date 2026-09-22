// CMP-J17 · the printed Quality Complaint — OQ-06 TC-06-07 / URS-CMP-07.
//
// WHY THIS FILE EXISTS.  §9 scored URS-CMP-07 "Not automated — printing a
// complaint record in full has no test".  The printout is the artefact that
// leaves the building: it is what an inspector is handed, and what a
// complainant or a notified body receives.  What it OMITS therefore matters
// as much as what it carries, which is why this file asserts an omission
// (the reportability rationale on an undecided complaint, and the signature
// block for a printer without the audit-trail grant) alongside the content.
//
// THE PRINT VIEW IS A SEPARATE ROUTE, NOT A CSS MEDIA QUERY.  The detail
// page's Print action opens `/print?module=Complaint&id=<uuid>` in a new tab;
// `components/print/modules/index.js` dispatches the `Complaint` module key to
// `ComplaintPrint.vue`, which renders inside the shared `PrintLayout`.  So
// this file drives the real action and follows the popup, exactly as the
// audits PW-J8 print journey does — a direct goto would prove the component
// renders but not that the product offers a way to reach it.
//
// `window.print()` IS STUBBED BEFORE THE POPUP OPENS.  PrintLayout fires it
// automatically once its data resolves, and a real print dialog blocks the
// browser for the rest of the run.
//
// THE AUDIT-TRAIL CARVE-OUT IS THE MOST IMPORTANT ASSERTION HERE, and it is
// the one OQ-06 §5 lists as untested: "Audit Trail read is a separate grant
// from Complaints read."  `complaintOwner` holds every complaints action at
// TENANT scope and NO audit_trail grant, so their printout must carry the
// explicit "Not shown on this copy … their absence is not evidence that this
// record is unsigned" notice rather than a silently empty signature block.
// A copy that simply omitted the block would read, to whoever holds the
// paper, as an unsigned record — that is the failure mode the notice exists
// to prevent, and nothing tested it before.
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { createPersonaPool, errorMessage, findComplaint, restPost } from '../fixtures/complaints.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const PREFIX = 'E2E J17'
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

function purgeJ17() {
  const mine = `SELECT id FROM complaints WHERE subject LIKE ${q(`${PREFIX}%`)}`
  sql(`DELETE FROM record_links WHERE from_id IN (${mine}) OR to_id IN (${mine})`)
  sql(`DELETE FROM complaint_records WHERE complaint_id IN (${mine})`)
  sql(`DELETE FROM workflow_instances WHERE resource_type = 'Complaint' AND resource_id IN (${mine})`)
  sql(`DELETE FROM complaints WHERE subject LIKE ${q(`${PREFIX}%`)}`)
}

/** A complaint carrying a value in every section the printout renders. */
const FULL_RECORD = {
  description: 'CMP-J17 narrative: unit arrived with a cracked housing.',
  batchLotSerial: 'LOT-J17-7788',
  quantityAffected: 3,
  orderInvoiceNumber: 'SO-J17-4410',
  customerName: 'Priya J17 Complainant',
  customerCompany: 'J17 Clinical Supplies',
  customerEmail: 'priya.j17@e2e.test',
  customerPhone: '+1-555-0177',
  sampleReceived: true,
  safetyIssue: true,
  potentialRecall: true,
  investigationRequired: true,
  investigation: 'CMP-J17 investigation: housing cracked in transit, packaging under review.',
  reviewSummary: 'CMP-J17 conclusion: transit damage, no manufacturing defect.',
  disposition: 'Replace under warranty',
}

async function mint(page, subject, body = {}) {
  const res = await restPost(page, '/complaints', { subject, ...body })
  expect(res.status(), `arrange failed: ${await errorMessage(res)}`).toBe(201)
  return (await res.json()).complaint.id
}

/**
 * Open the complaint detail page, click its real Print action, and hand back
 * the popup — with window.print stubbed first.
 */
async function openPrintout(page, complaintId, complaintNumber) {
  await page.context().addInitScript(() => {
    window.print = () => {}
  })
  await page.goto(`/complaints/${complaintId}`)
  // The number renders in the breadcrumb, a list row and the detail panel at
  // once — scope to the panel to avoid a strict-mode violation, the same fix
  // J1 and J4 carry.
  await expect(
    page.getByLabel('Details').getByText(complaintNumber, { exact: false }).first(),
  ).toBeVisible({ timeout: 45_000 })

  const [printout] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'Print', exact: true }).click(),
  ])
  await printout.waitForLoadState('domcontentloaded')
  return printout
}

test.describe('CMP-J17 · the printed complaint record', () => {
  test.beforeAll(() => purgeJ17())
  test.afterAll(() => purgeJ17())

  test('TC-06-07 steps 1+2 · the printout carries the narrative, classification, product and lot, customer detail and the QA assessment', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const subject = `${PREFIX} full record`
    const id = await mint(page, subject, FULL_RECORD)
    const number = findComplaint(id).complaintNumber

    const printout = await openPrintout(page, id, number)

    // Step 1 — the right record, reached through the product's own action.
    const url = new URL(printout.url())
    expect(url.searchParams.get('module'), 'the Print action dispatches the Complaint module').toBe(
      'Complaint',
    )
    expect(url.searchParams.get('id'), 'for this complaint').toBe(id)

    await expect(
      printout.getByRole('heading', { name: subject }),
      'the subject is the printed title',
    ).toBeVisible({ timeout: 60_000 })
    await expect(printout.getByText(number).first(), 'and the complaint number is on it').toBeVisible()

    // Step 2 — each of the five sections the protocol enumerates, asserted by
    // its heading AND by a value inside it. A heading alone would pass on an
    // empty section, which is exactly the failure a printed record must not
    // have.
    await expect(
      printout.getByRole('heading', { name: 'Complaint', exact: true }),
    ).toBeVisible()
    await expect(
      printout.getByText('cracked housing', { exact: false }),
      'the narrative is printed in full, not truncated to a summary line',
    ).toBeVisible()

    await expect(printout.getByRole('heading', { name: 'Product & origin' })).toBeVisible()
    await expect(
      printout.getByText('LOT-J17-7788'),
      'the lot / batch reference — 820.198(e)(2) — is on the copy',
    ).toBeVisible()
    await expect(printout.getByText('SO-J17-4410'), 'and the order reference').toBeVisible()

    await expect(printout.getByRole('heading', { name: 'Classification' })).toBeVisible()
    await expect(printout.getByRole('heading', { name: 'Customer' })).toBeVisible()
    await expect(
      printout.getByText('Priya J17 Complainant'),
      "the complainant's name — 820.198(e)(3) — is on the copy",
    ).toBeVisible()
    await expect(printout.getByText('priya.j17@e2e.test'), 'with their contact detail').toBeVisible()

    await expect(printout.getByRole('heading', { name: 'QA assessment' })).toBeVisible()
    await expect(
      printout.getByRole('heading', { name: 'Investigation' }),
      'the investigation narrative has its own printed sub-section',
    ).toBeVisible()
    await expect(printout.getByText('packaging under review', { exact: false })).toBeVisible()
    await expect(printout.getByRole('heading', { name: 'Review summary' })).toBeVisible()
    await expect(printout.getByText('no manufacturing defect', { exact: false })).toBeVisible()

    // Step 4 — nothing is truncated. Asserted as the LAST section still being
    // present and populated, which is what a clipped render loses first.
    await expect(
      printout.getByText('Replace under warranty'),
      'the disposition — in the last section — is still on the page, so nothing was clipped',
    ).toBeVisible()

    await printout.close()
  })

  test('TC-06-07 step 3 · the printout shows the status and its print provenance', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const id = await mint(page, `${PREFIX} provenance`, FULL_RECORD)
    const number = findComplaint(id).complaintNumber
    expect(findComplaint(id).statusId, 'precondition: the complaint is OPEN').toBe('OPEN')

    const printout = await openPrintout(page, id, number)
    await expect(printout.getByText(number).first()).toBeVisible({ timeout: 60_000 })

    await expect(
      printout.getByText('Open', { exact: true }).first(),
      'the status travels with the copy — a reader can see it is not a closed record',
    ).toBeVisible()

    // Print provenance closes the "who printed this controlled copy" question.
    // Matched on the persona's real name, so a regression that printed a
    // placeholder or the wrong session would be caught.
    await expect(
      printout.getByText(/Printed by/),
      'the copy names who printed it and when',
    ).toBeVisible()
    await expect(printout.getByText(new RegExp(`Printed by .*${USERS.complaintOwner.name}`))).toBeVisible()

    await printout.close()
  })

  test('the signature block is not silently omitted for a printer without the audit-trail grant — it says so, in writing', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const id = await mint(page, `${PREFIX} audit carve-out`, FULL_RECORD)
    const number = findComplaint(id).complaintNumber

    // The premise, measured rather than assumed: complaintOwner holds every
    // complaints action and no audit_trail grant. If a seed change ever gave
    // them one, this test would assert the wrong branch and pass for the
    // wrong reason.
    expect(
      sqlValue(
        `SELECT count(*) FROM authz.role_module_permissions rmp
           JOIN roles_on_users ru ON ru.role_id = rmp.role_id
          WHERE ru.user_id = ${q(USERS.complaintOwner.id)} AND rmp.module_id = 'audit_trail'`,
      ),
      'the printing persona holds no audit_trail grant — the premise of this test',
    ).toBe('0')

    const printout = await openPrintout(page, id, number)
    await expect(printout.getByText(number).first()).toBeVisible({ timeout: 60_000 })

    await expect(
      printout.getByRole('heading', { name: 'Approvals & Signatures' }),
      'the section is still printed — omitting it entirely is the failure mode',
    ).toBeVisible()
    await expect(
      printout.getByText('Not shown on this copy.'),
      'and it says plainly that the block is withheld, not absent',
    ).toBeVisible()
    await expect(
      printout.getByText(
        'Their absence is not evidence that this record is unsigned.',
        { exact: false },
      ),
      'with the sentence that stops a reader treating a withheld block as an unsigned record',
    ).toBeVisible()

    await printout.close()
  })

  test('an undecided reportability prints as empty rather than as a decision — the printout never invents one', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    // No reportability fields sent — which is every complaint in practice,
    // because OQ-06 TC-06-04 records that no screen in the application can
    // set them. The protocol tells the executor the printed complaint "will
    // show these fields as empty"; this pins that it does, rather than
    // defaulting to a reassuring 'NOT_REPORTABLE'.
    const id = await mint(page, `${PREFIX} undecided reportability`, {
      description: 'CMP-J17 — reportability never assessed.',
    })
    const number = findComplaint(id).complaintNumber
    expect(
      sqlValue(`SELECT coalesce(reportability_status, 'NULL') FROM complaints WHERE id = ${q(id)}`),
      'precondition: no reportability decision was recorded',
    ).toBe('NULL')

    const printout = await openPrintout(page, id, number)
    await expect(printout.getByRole('heading', { name: 'QA assessment' })).toBeVisible({
      timeout: 60_000,
    })

    // The row is still LABELLED — so a reader can see the question was asked
    // and not answered — while the value is the em-dash placeholder rather
    // than a fabricated verdict.
    //
    // Located by the `<th>` label, not by getByRole('cell'): the print tables
    // are `<th>` for the label and `<td>` for the value, and `cell` only
    // matches the `<td>` half — the label would never resolve.
    const reportabilityRow = printout
      .locator('tr')
      .filter({ has: printout.locator('th', { hasText: /^Reportability$/ }) })
      .first()
    await expect(
      reportabilityRow,
      'the reportability row is printed even when undecided',
    ).toBeVisible()
    await expect(
      reportabilityRow,
      'and carries no decision — never a defaulted "Not reportable"',
    ).not.toContainText(/REPORTABLE/i)

    // The rationale sub-section is conditional on there BEING a rationale, so
    // an undecided complaint must not print an empty one.
    await expect(
      printout.getByRole('heading', { name: 'Reportability rationale' }),
      'and no empty rationale heading is printed',
    ).toHaveCount(0)

    await printout.close()
  })
})
