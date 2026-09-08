// PJ-J10 — audit coverage of the fields that change what the QMS DOES with an
// item. (docs/modules/products/14-playwright-journeys.md, PW-J10.)
//
// ⚠ THE PACK DESCRIBES THIS AS "WRITTEN TO FAIL TODAY". It no longer does.
// `worker/services/audit/registry/modules/products.js` ran `mode: 'fields'` with
// `trackFields: ['statusId','name','stateId']` — and in that mode `handleDefault`
// consults `hasRelevantChanges()`, so an UPDATE touching none of the tracked
// fields writes NO `audit_logs` row at all. Not a thin one. None. Silently
// unaudited, therefore: sku, revision, erpItemCode, productTypeId,
// itemCategoryId, productFamilyId, uomId, criticality, inspectionRequired,
// defaultAql, lotControlled, serialControlled, shelfLifeDays, isHazardous,
// countryOfOrigin, storageConditions. (`stateId` was a phantom — not a column on
// this table at all — so it never matched anything either.)
//
// P2 widened the list to 18 curated fields. This file is the green gate on that
// fix, and it is written the way it is because of one asymmetry: proving a row
// EXISTS is easy and proves little on its own. The load-bearing test here is the
// NEGATIVE one — `description` is DELIBERATELY untracked (free-text prose with
// no downstream behaviour, the same call made on every other module), so an
// edit that touches only `description` must produce NO row. Without it, "every
// field I tried produced an audit row" is equally consistent with a registry
// that audits everything, which is a different product and a much noisier one.
//
// ── WHY MOST OF THIS IS SQL RATHER THAN UI CLICKS ──────────────────────────
// The claim under test is "changing ONLY field X writes an audit row". A UI save
// sends whatever the dialog's patch contains — `updatedBy` always, plus any
// field the form normalised on the way through ('' → null on erpItemCode,
// defaultAql, countryOfOrigin…). That makes "only X changed" hard to guarantee
// and easy to get accidentally-green. `sqlAsAppUser` issues EXACTLY the same
// statement PostGraphile would (SET ROLE app_user with the session GUCs), hits
// the same `products_audit_trigger`, enqueues the same `audit_event` job and is
// processed by the same worker — with exactly one column in the SET clause.
// The first test drives the real browser path so the chain is proven end to
// end; the rest are precise.
import { test, expect } from '@playwright/test'
import { sql, sqlValue } from '../fixtures/db.js'
import {
  PRODUCTS,
  asPersona,
  createPersonaPool,
  dialog,
  expectRowsAffected,
  findProduct,
  openItemDetail,
  resetSeededItem,
} from '../fixtures/products.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const subject = PRODUCTS.items.auditSubject

/** Audit rows written for the subject since `since` (a psql timestamp string). */
function auditRowsSince(since) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM audit_logs
        WHERE entity_type = 'Products' AND entity_id = '${subject.id}'
          AND performed_at > '${since}'::timestamptz`,
    ),
  )
}

/** The newest audit row's action + payload, for attribution assertions. */
function newestAuditRow() {
  const row = sql(
    `SELECT action, coalesce(new_value_json::text, ''), coalesce(performed_by::text, '')
       FROM audit_logs
      WHERE entity_type = 'Products' AND entity_id = '${subject.id}'
      ORDER BY performed_at DESC LIMIT 1`,
  )
  if (!row) return null
  const [action, payload, performedBy] = row.split('|')
  return { action, payload, performedBy }
}

function now() {
  return sqlValue('SELECT NOW()::text')
}

/**
 * Change exactly one column and wait for the audit worker to catch up.
 *
 * The audit trigger does not write `audit_logs` — it `PERFORM
 * graphile_worker.add_job('audit_event', …)`, and the WORKER writes the row. So
 * every assertion here is a barrier, not a read: a bare check would race the
 * queue and fail intermittently, which is worse than not testing it.
 */
async function editAndCount(setClause, { expectRow }) {
  const since = now()
  const res = asPersona(PRODUCTS.admin, `UPDATE products SET ${setClause} WHERE id = '${subject.id}';`)
  expectRowsAffected(res, 1, `the edit itself landed: ${setClause}`)

  if (expectRow) {
    await expect
      .poll(() => auditRowsSince(since), { timeout: 30_000, intervals: [500] })
      .toBeGreaterThan(0)
    return auditRowsSince(since)
  }

  // Proving an ABSENCE needs a positive control to bound the wait, or the test
  // is just "we did not wait long enough". A tracked edit is issued immediately
  // after; when ITS row arrives, the queue has demonstrably drained past the
  // untracked one.
  const marker = asPersona(
    PRODUCTS.admin,
    `UPDATE products SET name = '${subject.name} (queue marker)' WHERE id = '${subject.id}';`,
  )
  expectRowsAffected(marker, 1, 'the marker edit landed')
  await expect
    .poll(() => auditRowsSince(since), { timeout: 30_000, intervals: [500] })
    .toBeGreaterThan(0)
  // The queue has drained. Exactly ONE row should exist — the marker's.
  const total = auditRowsSince(since)
  asPersona(PRODUCTS.admin, `UPDATE products SET name = '${subject.name}' WHERE id = '${subject.id}';`)
  return total
}

test.describe('PJ-J10 · the audit registry, field by field', () => {
  test.beforeAll(() => {
    resetSeededItem(subject.id, {
      name: subject.name,
      revision: subject.revision,
      criticality: subject.criticality,
      is_hazardous: 'false',
      description: 'PW-J10 edits this row field by field and reads audit_logs back.',
    })
  })

  test.afterAll(() => {
    resetSeededItem(subject.id, {
      name: subject.name,
      revision: subject.revision,
      criticality: subject.criticality,
      is_hazardous: 'false',
      description: 'PW-J10 edits this row field by field and reads audit_logs back.',
    })
    const after = findProduct(subject.id)
    expect(after.revision, 'the fixture is back where §37c left it').toBe(subject.revision)
    expect(after.criticality).toBe(subject.criticality)
    expect(after.isHazardous).toBe(false)
  })

  test('a browser edit of ONLY the revision produces an audit row, attributed', async ({
    browser,
  }) => {
    // The end-to-end proof: the dialog → syncEngine → GraphQL → app_user →
    // products_audit_trigger → graphile_worker → audit_logs chain, driven by a
    // real click. Every later test in this file short-circuits the first three
    // hops for precision; this one shows they are actually connected.
    const page = await pool.page(browser, PRODUCTS.admin.auth)
    await openItemDetail(page, subject)

    const since = now()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const d = dialog(page)
    await expect(d.getByText('Edit Item', { exact: true })).toBeVisible()
    await d.getByRole('textbox', { name: 'Revision', exact: true }).fill('R1-UI')
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click()

    await expect
      .poll(() => findProduct(subject.id).revision, { timeout: 30_000 })
      .toBe('R1-UI')
    await expect
      .poll(() => auditRowsSince(since), { timeout: 30_000, intervals: [500] })
      .toBeGreaterThan(0)

    const row = newestAuditRow()
    expect(row.payload, 'the diff names the field that changed').toContain('revision')
    expect(
      row.performedBy,
      'attribution comes from the app.current_user_id GUC the API sets before the statement runs',
    ).toBe(PRODUCTS.admin.user.id)
  })

  test('revision, criticality and isHazardous each produce a row on their own', async () => {
    // The three fields the pack named. Each is a single-column UPDATE, so a row
    // here can only have come from that field being tracked.
    expect(await editAndCount(`revision = 'R2'`, { expectRow: true })).toBeGreaterThan(0)
    expect(await editAndCount(`criticality = 'MAJOR'`, { expectRow: true })).toBeGreaterThan(0)
    expect(await editAndCount(`is_hazardous = true`, { expectRow: true })).toBeGreaterThan(0)

    // `criticality` is also the column migration 20260907250000 gave a CHECK,
    // which is worth pinning in the same breath: the value set is closed at the
    // one layer PostGraphile cannot route around, and there is no server-side
    // write path where a Zod schema could have done it instead.
    const bad = asPersona(
      PRODUCTS.admin,
      `UPDATE products SET criticality = 'critcal' WHERE id = '${subject.id}';`,
    )
    expect(bad.ok, 'products_criticality_chk refuses a typo').toBe(false)
    expect(bad.error).toMatch(/products_criticality_chk/i)
  })

  test('the POSITIVE CONTROL: name still produces a row', async () => {
    // `name` was one of only two tracked fields before P2. If it stopped
    // producing a row, the whole registry would be broken and every assertion
    // above would be about something other than field coverage.
    expect(
      await editAndCount(`name = '${subject.name} (renamed)'`, { expectRow: true }),
    ).toBeGreaterThan(0)
    resetSeededItem(subject.id, { name: subject.name })
  })

  test('the NEGATIVE CONTROL: description is untracked and produces NO row', async () => {
    // The load-bearing test. `mode: 'fields'` is a FILTER, and a filter that
    // passes everything is not a filter. `description` is deliberately excluded
    // — free-text prose with no downstream behaviour — so this is the assertion
    // that the 18-field list is a real curation rather than an accident.
    const rows = await editAndCount(`description = 'PJ-J10 untracked prose'`, { expectRow: false })
    expect(
      rows,
      'exactly one row since the barrier — the queue marker’s. The description edit wrote none.',
    ).toBe(1)
  })
})
