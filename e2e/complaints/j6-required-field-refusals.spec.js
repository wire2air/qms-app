// CMP-J6 · Required-field refusals for BOTH complaint modules —
// OQ-06 TC-06-01 (Quality Complaints) and OQ-17 TC-17-01 (Customer Complaints).
//
// WHY THIS FILE COVERS TWO MODULES. `complaints` (internal Quality Complaints)
// and `complaint_management` (Customer Complaints / support) are separate authz
// modules over separate tables with separate routes, granted independently. The
// refusal shape is identical, so they share a file — but each arm speaks as its
// own persona and counts its own table, because a permission regression on one
// is invisible to a probe of the other.
//
// EXPECT ONE ARM EACH, AND THAT IS CORRECT. Both schemas require exactly one
// field: `subject`. Everything else — description, category, type, severity,
// product, lot, customer detail, the safety/recall flags — is `.optional()`, by
// design: both modules take a complaint at the door and defer classification to
// the detail page. So a nine-key loop like CAPA's would assert refusals against
// fields that are deliberately optional, which is the trap NC's draft-route
// carve-out exists to avoid. One honest arm per module beats nine false ones.
//
// The protocols ask for more than this (TC-06-01 steps 3-5 want description,
// product and lot refused; TC-17-01 step 3 wants description refused). Those
// steps describe a stricter product than the one that ships. Executed as
// written they will not pass, and that is a protocol-vs-product gap to record,
// not something to force with a test that contradicts the schema.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import {
  expectEmptyFormRefused,
  expectMissingFieldRefused,
  expectValidBodyAccepted,
} from '../fixtures/negativeArms.js'

function uniqueSubject(tag) {
  return `E2E ${tag} ${Date.now()}`
}

// ── Quality Complaints (internal) ─────────────────────────────────────────
/**
 * Scoped to the tenant on purpose. This count is the evidence that a refused
 * create wrote NOTHING, so it is compared before and after the refusal — and an
 * unscoped `count(*)` makes any concurrent insert anywhere in the database
 * (a graphile_worker job, another tenant's fixture, a leaked row from an
 * earlier spec) look like the refused create having written a row. That is a
 * SECURITY-SHAPED false positive: it reports "a rejected request created a
 * record", which is the most alarming thing this suite can say.
 */
function complaintCount() {
  return Number(
    sqlValue(`SELECT count(*) FROM complaints WHERE company_id = '${COMPANY_ID}'`),
  )
}
function findComplaintBySubject(subject) {
  return sqlValue(`SELECT id FROM complaints WHERE subject = '${subject}' LIMIT 1`)
}
function validComplaintBody(subject) {
  return { subject, description: 'CMP-J6 — required-field arm control body.' }
}

test.describe('CMP-J6 · Quality Complaints required-field refusals', () => {
  test.use({ storageState: AUTH.complaintOwner })

  test('control: the body the negative arm is derived from is accepted', async ({ browser }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.complaintOwner })
    const subject = uniqueSubject('J6-control')

    await expectValidBodyAccepted(ctx, {
      path: '/complaints',
      validBody: validComplaintBody(subject),
    })

    const id = findComplaintBySubject(subject)
    expect(id, 'the control body created a real complaint').toBeTruthy()

    // The controller auto-starts the QA-review workflow on create, so the
    // workflow instance and its tasks go with the row.
    sql(`DELETE FROM complaints WHERE id = '${id}'`)
    await ctx.close()
  })

  test("REST: creating a complaint without 'subject' is refused 400 and writes nothing", async ({
    browser,
  }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.complaintOwner })

    await expectMissingFieldRefused(ctx, {
      path: '/complaints',
      validBody: validComplaintBody(uniqueSubject('J6-no-subject')),
      omit: 'subject',
      countRows: complaintCount,
    })

    await ctx.close()
  })

  test('UI: submitting an empty create form tells the user what is missing', async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: AUTH.complaintOwner })
    const page = await ctx.newPage()

    // Single-screen form — no workflow picker, so no `reach` hook.
    await expectEmptyFormRefused(page, {
      createPath: '/complaints/create',
      submitLabel: 'Create Complaint',
      countRows: complaintCount,
    })

    await ctx.close()
  })
})

// ── Customer Complaints (support) ─────────────────────────────────────────
/**
 * Scoped to the tenant on purpose. This count is the evidence that a refused
 * create wrote NOTHING, so it is compared before and after the refusal — and an
 * unscoped `count(*)` makes any concurrent insert anywhere in the database
 * (a graphile_worker job, another tenant's fixture, a leaked row from an
 * earlier spec) look like the refused create having written a row. That is a
 * SECURITY-SHAPED false positive: it reports "a rejected request created a
 * record", which is the most alarming thing this suite can say.
 */
function customerComplaintCount() {
  return Number(
    sqlValue(`SELECT count(*) FROM customer_complaints WHERE company_id = '${COMPANY_ID}'`),
  )
}
function findCustomerComplaintBySubject(subject) {
  return sqlValue(`SELECT id FROM customer_complaints WHERE subject = '${subject}' LIMIT 1`)
}
function validCustomerComplaintBody(subject) {
  return { subject, description: 'CMP-J6 — required-field arm control body.' }
}

test.describe('CMP-J6 · Customer Complaints required-field refusals', () => {
  test.use({ storageState: AUTH.supportAgent })

  test('control: the body the negative arm is derived from is accepted', async ({ browser }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.supportAgent })
    const subject = uniqueSubject('J6-cc-control')

    await expectValidBodyAccepted(ctx, {
      path: '/customerComplaints',
      validBody: validCustomerComplaintBody(subject),
    })

    const id = findCustomerComplaintBySubject(subject)
    expect(id, 'the control body created a real customer complaint').toBeTruthy()
    // Proves the row landed in the SUPPORT table, not the internal one — the
    // two surfaces read different tables and J3 pins that they never cross.
    expect(
      findComplaintBySubject(subject),
      'a customer complaint must not appear in the internal table',
    ).toBeFalsy()

    sql(`DELETE FROM customer_complaints WHERE id = '${id}'`)
    await ctx.close()
  })

  test("REST: creating a customer complaint without 'subject' is refused 400 and writes nothing", async ({
    browser,
  }) => {
    test.setTimeout(60_000)
    const ctx = await browser.newContext({ storageState: AUTH.supportAgent })

    await expectMissingFieldRefused(ctx, {
      path: '/customerComplaints',
      validBody: validCustomerComplaintBody(uniqueSubject('J6-cc-no-subject')),
      omit: 'subject',
      countRows: customerComplaintCount,
    })

    await ctx.close()
  })

  test('UI: submitting an empty create form tells the user what is missing', async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: AUTH.supportAgent })
    const page = await ctx.newPage()

    // Same button label as the internal form ('Create Complaint') on a
    // different route — the URL is what disambiguates them.
    await expectEmptyFormRefused(page, {
      createPath: '/customer-complaints/create',
      submitLabel: 'Create Complaint',
      countRows: customerComplaintCount,
    })

    await ctx.close()
  })
})
