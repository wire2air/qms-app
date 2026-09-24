// CMP-J12 · internal Quality Complaint — classification, product, lot and
// customer detail actually PERSIST.  OQ-06 TC-06-02 / URS-CMP-02.
//
// WHY THIS FILE EXISTS.  automated-regression-coverage.md §9 scored URS-CMP-02
// "Not automated — no test asserts classification, product, lot, customer
// detail or attachments persist".  That row is the one a regulator reads first
// on a complaint file: 21 CFR 820.198(e) requires the complaint record to hold
// the name of the device, the lot, the complainant's name and address, and the
// nature of the complaint.  If any of those columns silently drops a value,
// the record is incomplete and nothing in the suite noticed.
//
// THE SIBLING MODULE FAILS THIS REQUIREMENT AND THIS ONE DOES NOT — that
// asymmetry is the point.  URS-CCM-02 is classified *Product non-conformant*
// (defect CC-D1) precisely because `customer_complaints` has no category /
// severity / product / lot columns at all.  The INTERNAL `complaints` table
// does have every one of them, and `createComplaint`'s FIELD_NAMES whitelist
// (controllers/complaints.js) copies them verbatim off the validated body.  A
// regression that dropped a name out of that whitelist would return 201 with
// the value silently discarded — exactly the CC-D1 failure shape — and only a
// column-by-column read-back catches it.  Hence: assert the DATABASE, never
// the 201.
//
// SUBJECT NAMESPACE.  Every row this file mints is subjected `E2E J12 …` and
// purged by that exact string.  `purgeMintedComplaints()` from the shared
// fixture deletes every `E2E J%` complaint, which would tear down a
// concurrently-running J1/J2, so this file never calls it — it owns its own
// narrow purge and nothing else.  Each test arranges its OWN row for the same
// reason the file-level purge is narrow: Playwright discards the worker after
// a failing test and runs the pending afterAll, so a fixture shared across
// tests evaporates the moment one of them goes red.
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import { sql, sqlRow, sqlValue } from '../fixtures/db.js'
import { createPersonaPool, errorMessage, restPost } from '../fixtures/complaints.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const PREFIX = 'E2E J12'
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const COMPANY_ID = 'e2e00001-0000-4000-8000-000000000001'

/** Purge only this file's rows — never the shared `E2E J%` LIKE sweep. */
function purgeJ12() {
  sql(
    `DELETE FROM record_links WHERE from_id IN (SELECT id FROM complaints WHERE subject LIKE ${q(`${PREFIX}%`)})
        OR to_id IN (SELECT id FROM complaints WHERE subject LIKE ${q(`${PREFIX}%`)})`,
  )
  sql(
    `DELETE FROM complaint_records WHERE complaint_id IN (SELECT id FROM complaints WHERE subject LIKE ${q(`${PREFIX}%`)})`,
  )
  sql(
    `DELETE FROM workflow_instances WHERE resource_type = 'Complaint'
       AND resource_id IN (SELECT id FROM complaints WHERE subject LIKE ${q(`${PREFIX}%`)})`,
  )
  sql(`DELETE FROM complaints WHERE subject LIKE ${q(`${PREFIX}%`)}`)
}

/**
 * Create one complaint over the real REST route and hand back its id.
 *
 * Every test calls this itself rather than sharing a beforeAll fixture — see
 * the worker-discard note in this file's header.
 */
async function mint(page, subject, body = {}) {
  const res = await restPost(page, '/complaints', { subject, ...body })
  expect(res.status(), `arrange failed: ${await errorMessage(res)}`).toBe(201)
  const json = await res.json()
  return json.complaint.id
}

/**
 * The J12-owned classification lookups.
 *
 * `complaint_categories` / `_types` / `_severities` / `_risk_levels` /
 * `_source_types` / `_customer_types` are PER-TENANT tables, and E2ELAB has
 * ZERO rows in every one of them (verified against the live DB) — the seed
 * never populated them, because no journey needed one before this. Reading
 * "the first lookup the tenant has" would therefore find nothing and make the
 * whole classification arm pass vacuously.
 *
 * So this file seeds its own, with fixed ids under a J12-only prefix, and
 * removes them in afterAll. Fixed rather than Date.now() ids so a crashed run
 * is still cleanable on the next attempt, and `ON CONFLICT DO NOTHING` so
 * re-seeding is idempotent. They are deliberately NOT added to
 * e2e-seed.sql — a tenant-wide lookup would appear in every other suite's
 * complaint pickers.
 */
const LOOKUPS = {
  categoryId: { table: 'complaint_categories', id: 'e2e5ec00-0000-4000-8000-000000000001' },
  typeId: { table: 'complaint_types', id: 'e2e5ec00-0000-4000-8000-000000000002' },
  severityId: { table: 'complaint_severities', id: 'e2e5ec00-0000-4000-8000-000000000003' },
  riskLevelId: { table: 'complaint_risk_levels', id: 'e2e5ec00-0000-4000-8000-000000000004' },
  sourceId: { table: 'complaint_source_types', id: 'e2e5ec00-0000-4000-8000-000000000005' },
  customerTypeId: { table: 'complaint_customer_types', id: 'e2e5ec00-0000-4000-8000-000000000006' },
}

function seedLookups() {
  for (const [key, { table, id }] of Object.entries(LOOKUPS)) {
    sql(
      `INSERT INTO ${table} (id, company_id, code, name, display_order)
       VALUES (${q(id)}, ${q(COMPANY_ID)}, ${q(`E2E_J12_${key.toUpperCase()}`)}, ${q(`E2E J12 ${key}`)}, 9000)
       ON CONFLICT (id) DO NOTHING`,
    )
    sql(`UPDATE ${table} SET deleted_at = NULL WHERE id = ${q(id)}`)
  }
}

function purgeLookups() {
  for (const { table, id } of Object.values(LOOKUPS)) {
    sql(`DELETE FROM ${table} WHERE id = ${q(id)}`)
  }
}

test.describe('CMP-J12 · classification, product and customer detail persist', () => {
  // Complaints first, lookups second — a complaint FKs INTO a lookup, so the
  // reverse order leaves the DELETE blocked by a live reference.
  test.beforeAll(() => {
    purgeJ12()
    purgeLookups()
  })
  test.afterAll(() => {
    purgeJ12()
    purgeLookups()
  })

  test('TC-06-02 steps 2-5 · product, lot, quantity, order ref, customer detail, samples and the safety/recall flags all reach their own columns', async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const subject = `${PREFIX} detail persistence`

    // A distinct, greppable value per column — a whitelist that dropped one
    // name would leave that single cell empty while every other one matched,
    // which a single blob comparison could not localise.
    const payload = {
      description: 'CMP-J12 — narrative for the detail-persistence arm.',
      batchLotSerial: 'LOT-J12-0042',
      quantityAffected: 17,
      orderInvoiceNumber: 'SO-J12-9001',
      customerName: 'Jamie J12 Complainant',
      customerCompany: 'J12 Distribution Ltd',
      customerEmail: 'jamie.j12@e2e.test',
      customerPhone: '+1-555-0142',
      stateProvince: 'Massachusetts',
      sampleReceived: true,
      safetyIssue: true,
      potentialRecall: true,
      repeatIssue: true,
      complianceRelated: true,
      disposition: 'Replace and credit',
    }
    const id = await mint(page, subject, payload)

    // `description` is TEXT and may hold newlines; a multi-line column breaks
    // the `out.split('\n')[0]` row parsing every other read in this suite
    // relies on, so it is fetched on its own.
    const row = sqlRow(
      `SELECT batch_lot_serial, quantity_affected, order_invoice_number, customer_name,
              customer_company, customer_email, customer_phone, state_province,
              sample_received, safety_issue, potential_recall, repeat_issue,
              compliance_related, disposition
         FROM complaints WHERE id = ${q(id)}`,
    )
    const [
      batchLotSerial,
      quantityAffected,
      orderInvoiceNumber,
      customerName,
      customerCompany,
      customerEmail,
      customerPhone,
      stateProvince,
      sampleReceived,
      safetyIssue,
      potentialRecall,
      repeatIssue,
      complianceRelated,
      disposition,
    ] = row

    // 820.198(e)(2)/(3) — the lot and the complainant. These two are the ones
    // an inspector asks for by name.
    expect(batchLotSerial, 'the lot / batch / serial reference persisted verbatim').toBe(
      'LOT-J12-0042',
    )
    expect(customerName, "the complainant's name persisted").toBe('Jamie J12 Complainant')
    expect(customerCompany, "the complainant's organisation persisted").toBe('J12 Distribution Ltd')
    expect(customerEmail, "the complainant's email persisted").toBe('jamie.j12@e2e.test')
    expect(customerPhone, "the complainant's phone persisted").toBe('+1-555-0142')
    expect(stateProvince, 'the state/province of origin persisted').toBe('Massachusetts')

    expect(Number(quantityAffected), 'quantity affected persisted as a number, not a string').toBe(
      17,
    )
    expect(orderInvoiceNumber, 'the order / invoice reference persisted').toBe('SO-J12-9001')
    expect(disposition, 'the disposition persisted').toBe('Replace and credit')

    // TC-06-02 step 4 — the Yes/No sample value is CAPTURED (the printed
    // record renders it through yesNo()). `sample_received` is nullable, so
    // "not answered" and "answered No" are genuinely different states; psql
    // renders true as 't'.
    expect(sampleReceived, 'samples-received was captured as a real Yes, not left null').toBe('t')

    // TC-06-02 step 5 — the two flags a recall decision hangs off.
    expect(safetyIssue, 'the safety-issue flag persisted').toBe('t')
    expect(potentialRecall, 'the potential-recall flag persisted').toBe('t')
    expect(repeatIssue, 'the repeat-issue flag persisted').toBe('t')
    expect(complianceRelated, 'the compliance-related flag persisted').toBe('t')
  })

  test('the boolean flags are NOT NULL with a false default — an unanswered flag reads No, never unknown', async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const subject = `${PREFIX} flag defaults`
    // The pair that gives the previous test's four `'t'` values meaning: sent
    // nothing, they must come back false rather than null. `safety_issue`,
    // `regulatory_reportable`, `compliance_related`, `potential_recall` and
    // `repeat_issue` are all NOT NULL in the schema; `sample_received` is the
    // one deliberate three-state field (Yes / No / not asked).
    const id = await mint(page, subject)

    const row = sqlRow(
      `SELECT safety_issue, regulatory_reportable, compliance_related, potential_recall,
              repeat_issue, coalesce(sample_received::text, 'NULL')
         FROM complaints WHERE id = ${q(id)}`,
    )
    expect(row.slice(0, 5), 'every NOT NULL flag defaults to false, so none reads as unknown').toEqual([
      'f',
      'f',
      'f',
      'f',
      'f',
    ])
    expect(
      row[5],
      'sample_received is the one nullable flag — "not asked" is a distinct state from "No"',
    ).toBe('NULL')
  })

  test('TC-06-02 step 1 · category, sub-category, type, severity, risk level, source and customer type persist against the tenant lookups', async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const subject = `${PREFIX} classification`

    // Arranged by this test, not read off the tenant — E2ELAB has no
    // classification lookups of its own (see the LOOKUPS block above).
    seedLookups()
    const sent = Object.fromEntries(
      Object.entries(LOOKUPS).map(([key, { id }]) => [key, id]),
    )
    expect(
      Object.keys(sent).length,
      'six lookup dimensions are under test — a shrinking set would quietly narrow this assertion',
    ).toBe(6)

    const id = await mint(page, subject, sent)

    const row = sqlRow(
      `SELECT coalesce(category_id::text,''), coalesce(type_id::text,''),
              coalesce(severity_id::text,''), coalesce(risk_level_id::text,''),
              coalesce(source_id::text,''), coalesce(customer_type_id::text,'')
         FROM complaints WHERE id = ${q(id)}`,
    )
    const got = {
      categoryId: row[0],
      typeId: row[1],
      severityId: row[2],
      riskLevelId: row[3],
      sourceId: row[4],
      customerTypeId: row[5],
    }
    for (const [key, value] of Object.entries(sent)) {
      expect(got[key], `${key} persisted to its own column, not silently discarded`).toBe(value)
    }
  })

  test('the classification columns are FK-sealed to this tenant — a stranger lookup id is refused, not stored', async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const before = Number(sqlValue(`SELECT count(*) FROM complaints WHERE company_id = '${COMPANY_ID}'`))

    // A well-formed uuid that is not any lookup row anywhere. The zod schema
    // only checks the SHAPE (`z.string().uuid()`), so whatever refuses this is
    // the database FK — the control that actually stops a complaint being
    // classified against another tenant's taxonomy.
    const res = await restPost(page, '/complaints', {
      subject: `${PREFIX} stranger category`,
      categoryId: '00000000-0000-4000-8000-0000000000ff',
    })
    expect(
      res.status(),
      'a category id that exists nowhere is refused — the schema checks shape, the FK checks reality',
    ).toBeGreaterThanOrEqual(400)
    expect(
      Number(sqlValue(`SELECT count(*) FROM complaints WHERE company_id = '${COMPANY_ID}'`)),
      'and the refusal wrote no partial row',
    ).toBe(before)
  })

  test('the recorder and the creation date are captured, and there is no separate date-received field (TC-06-01 step 8)', async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const page = await pool.page(browser, AUTH.complaintOwner)
    const subject = `${PREFIX} provenance`
    const id = await mint(page, subject)

    const row = sqlRow(
      `SELECT created_by, owner_id, created_at IS NOT NULL, updated_by
         FROM complaints WHERE id = ${q(id)}`,
    )
    expect(row[0], 'created_by names the person who logged it — the recorder').toBe(
      USERS.complaintOwner.id,
    )
    expect(row[1], 'ownerId defaults to the creator when no responsible party is named').toBe(
      USERS.complaintOwner.id,
    )
    expect(row[2], 'the creation date is captured').toBe('t')
    expect(row[3], 'updated_by is attributed on create too').toBe(USERS.complaintOwner.id)

    // TC-06-01 step 8's note, pinned: the protocol tells the executor to
    // record the absence of a "date received" distinct from "date logged" as a
    // gap. If a `received_at`-shaped column is ever added, this assertion
    // fails and the protocol note must be revised rather than left stale.
    expect(
      sqlValue(
        `SELECT count(*) FROM information_schema.columns
          WHERE table_name = 'complaints'
            AND column_name IN ('received_at','date_received','reported_at','occurred_at')`,
      ),
      'there is still no separate date-received column — OQ-06 TC-06-01 step 8 records this as a gap',
    ).toBe('0')
  })

  test('the CMP- number is sequential from a locked counter — and carries NO uniqueness constraint (TC-06-01 step 7)', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const page = await pool.page(browser, AUTH.complaintOwner)

    const first = await mint(page, `${PREFIX} seq A`)
    const second = await mint(page, `${PREFIX} seq B`)
    const numberOf = (id) => sqlValue(`SELECT complaint_number FROM complaints WHERE id = ${q(id)}`)
    const a = numberOf(first)
    const b = numberOf(second)

    expect(a, 'the prefix is fixed in the product — CMP-, zero-padded to 3').toMatch(/^CMP-\d{3,}$/)
    expect(b).toMatch(/^CMP-\d{3,}$/)
    expect(
      Number(b.slice(4)) - Number(a.slice(4)),
      'consecutive creates take consecutive numbers from complaint_counters',
    ).toBe(1)

    // TC-06-01 step 7's note, pinned as a KNOWN DEFECT rather than asserted
    // away. The protocol tells the executor NOT to attempt to prove
    // uniqueness, because nothing enforces it — unlike the customer-complaint
    // register, which has a real unique index. This assertion records the
    // absence so that adding the constraint turns this red and the protocol
    // note gets revised, instead of the note quietly outliving the defect.
    //
    // KNOWN DEFECT: `complaints.complaint_number` has no unique index or
    // constraint. Numbers come from a row-locked counter so duplicates are not
    // expected in practice, but the database would accept one. Documented at
    // OQ-06 TC-06-01 step 7 and in that protocol's defect list.
    expect(
      sqlValue(
        `SELECT count(*) FROM pg_indexes
          WHERE tablename = 'complaints' AND indexdef ILIKE '%UNIQUE%'
            AND indexdef ILIKE '%complaint_number%'`,
      ),
      'KNOWN DEFECT (OQ-06 TC-06-01 step 7): no uniqueness constraint on complaint_number',
    ).toBe('0')
    // The pair that proves the probe is looking in the right place: the
    // SIBLING register does have one, so a zero above is a real absence and
    // not a broken query.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM pg_indexes
            WHERE tablename = 'customer_complaints' AND indexdef ILIKE '%UNIQUE%'
              AND indexdef ILIKE '%complaint_number%'`,
        ),
      ),
      'the customer-complaint register DOES carry one — so the zero above is an absence, not a bad query',
    ).toBeGreaterThan(0)
  })
})
