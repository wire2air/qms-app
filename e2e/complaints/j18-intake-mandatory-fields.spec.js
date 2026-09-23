// CMP-J18 · URS-CMP-01 / OQ-06 TC-06-01 steps 3-5 — the intake fields the
// protocol requires, and the three it does NOT enforce.
//
// ⚠️  THIS FILE PINS A PRODUCT NON-CONFORMANCE. Read the next section before
//     deciding what a green run here means.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS, AND WHY `j6` WAS NOT ENOUGH.
//
// §9 scored URS-CMP-01 *Partial* against `j6-required-field-refusals.spec.js`
// with the note "only subject is mandatory; protocol expects description,
// product and lot refused too". `j6`'s own header already says this in prose —
// it declines to write a nine-key loop because eight of the nine fields are
// deliberately optional, which was the right call. But prose in a header is not
// evidence. A validation reader executing TC-06-01 steps 3-5 needs to see the
// gap DEMONSTRATED, at every layer that could have closed it, or they cannot
// tell a deliberate design from an untested one.
//
// So this file does the opposite of relaxing the protocol: it runs the
// protocol's own steps and records precisely what happens.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FINDING (CMP-D2), MEASURED AT THREE LAYERS.
//
// TC-06-01 steps 3-5 expect a complaint submitted without a description,
// without a product and without a lot to be REFUSED. None of the three is.
//
//   SCHEMA   `createComplaintSchema` (backend/api/schemas/complaints.js)
//            requires exactly one field:
//                subject: z.string().min(1).max(500)
//            `description`, `productId` and `batchLotSerial` are each
//            `.optional().nullable()`, alongside every other classification
//            field. The file's own comment states the intent: "All QMS
//            classification fields optional at create; the detail page fills
//            them later via GraphQL."
//
//   DATABASE Of the four columns, only `subject` is NOT NULL
//            (information_schema, asserted below), and `complaints` carries NO
//            CHECK constraint at all (pg_constraint contype='c' → zero rows).
//            So nothing underneath the schema would catch it either.
//
//   UI       …and here the layers DISAGREE, which is the sharp end of the
//            finding. `QaComplaintsCreate.vue` marks all three `required` with
//            `:rules="[required()]"` — Description at line 285, Product at 344,
//            Batch/Lot at 370 — and its own source comment reads "No longer
//            `optional`: product and lot are required". So the product's
//            INTERFACE enforces the protocol and its SERVER does not.
//
// That last point is what makes this worth a defect rather than a shrug. It is
// not "the product chose a lightweight intake"; it is an interface-only
// control, the same class as URS-TRN-02's Defect D13 (authoring lock applied in
// the client, ignored by the server). Anyone who creates complaints through the
// API, an integration, or a replayed request bypasses a rule the UI presents as
// mandatory — and the resulting record looks, to every later reader, exactly
// like one that was properly classified.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE DOES NOT DO.
//
// It does not assert that the refusals happen. Writing
// `expect(res.status()).toBe(400)` against a route that answers 201 and then
// "fixing" the test by loosening it to `toBeLessThan(500)` is how a suite comes
// to certify the opposite of the requirement. The arrangement here is the
// honest one: assert the ACCEPTANCE, label it, and pair it with the comparator
// below so the gap cannot be read as a missing capability.
//
// THE COMPARATOR MATTERS (§47c). A reader shown only "these fields are not
// required" could reasonably conclude the product cannot hold them. It can:
// §47c seeds a complaint carrying subject + description + product + lot, and
// the last test reads all four back. The gap is enforcement, not capability,
// and those call for different corrective actions.
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import { sql, sqlRow, sqlValue } from '../fixtures/db.js'
import { createPersonaPool, errorMessage, restPost } from '../fixtures/complaints.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const PREFIX = 'E2E J18'
const COMPARATOR_ID = 'e2e5e000-0000-4000-8000-0000000000b1'
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

function purgeJ18() {
  const mine = `SELECT id FROM complaints WHERE subject LIKE ${q(`${PREFIX}%`)}`
  sql(`DELETE FROM record_links WHERE from_id IN (${mine}) OR to_id IN (${mine})`)
  sql(`DELETE FROM complaint_records WHERE complaint_id IN (${mine})`)
  sql(
    `DELETE FROM workflow_instances WHERE resource_type = 'Complaint' AND resource_id IN (${mine})`,
  )
  sql(`DELETE FROM complaints WHERE subject LIKE ${q(`${PREFIX}%`)}`)
}

function complaintCount() {
  return Number(sqlValue('SELECT count(*) FROM complaints'))
}

test.describe('CMP-J18 · URS-CMP-01 — the intake fields TC-06-01 expects to be mandatory', () => {
  test.beforeAll(() => purgeJ18())
  test.afterAll(() => purgeJ18())

  test('the only field enforced ANYWHERE is `subject` — schema, column and constraint all agree', async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const page = await pool.page(browser, AUTH.complaintOwner)

    // ── LAYER 1, THE DATABASE. Read from information_schema rather than
    // asserted from the migration, because the migration is not what runs.
    // These four columns are exactly the ones TC-06-01 steps 2-5 name.
    const nullability = sqlValue(
      `SELECT string_agg(column_name || '=' || is_nullable, ' ' ORDER BY column_name)
         FROM information_schema.columns
        WHERE table_name = 'complaints'
          AND column_name IN ('subject','description','product_id','batch_lot_serial')`,
    )
    expect(
      nullability,
      'KNOWN DEFECT CMP-D2: of the four intake fields, only `subject` is NOT NULL at the database — description, product and lot are all nullable',
    ).toBe('batch_lot_serial=YES description=YES product_id=YES subject=NO')

    // ── LAYER 2, CONSTRAINTS. A NOT NULL is not the only way to require a
    // field; a CHECK could demand "description IS NOT NULL when status is OPEN",
    // the way `nonconformances` does with `nc_complete_when_open`. There is no
    // such constraint here, and the NC comparison is the point: the codebase
    // knows this pattern and did not apply it to complaints.
    expect(
      sqlValue(
        `SELECT count(*) FROM pg_constraint
          WHERE conrelid = 'complaints'::regclass AND contype = 'c'`,
      ),
      'and `complaints` carries no CHECK constraint that could require them conditionally',
    ).toBe('0')

    expect(
      sqlValue(
        `SELECT count(*) FROM pg_constraint
          WHERE conrelid = 'nonconformances'::regclass AND contype = 'c'
            AND conname = 'nc_complete_when_open'`,
      ),
      'the sibling module DOES use exactly that pattern — so this is an omission, not an unavailable technique',
    ).toBe('1')

    // ── LAYER 3, THE ROUTE. The control: `subject` alone really is enough.
    // Asserted first because every negative arm below is derived from this
    // body, and an arm whose positive control was never run proves nothing.
    const before = complaintCount()
    const minimal = await restPost(page, '/complaints', {
      subject: `${PREFIX} subject only — no description, product or lot`,
    })
    expect(
      minimal.status(),
      `KNOWN DEFECT CMP-D2: a complaint with NOTHING but a subject is accepted — ${await errorMessage(minimal)}`,
    ).toBe(201)

    const created = (await minimal.json()).complaint
    const stored = sqlRow(
      `SELECT coalesce(description,'NULL'), coalesce(product_id::text,'NULL'),
              coalesce(batch_lot_serial,'NULL'), status_id, complaint_number
         FROM complaints WHERE id = ${q(created.id)}`,
    )
    expect(stored[0], 'and it is stored with a NULL description').toBe('NULL')
    expect(stored[1], 'a NULL product').toBe('NULL')
    expect(stored[2], 'and a NULL lot').toBe('NULL')
    expect(
      stored[3],
      'KNOWN DEFECT CMP-D2: the unclassified complaint lands OPEN — it is a live quality record, not a parked draft',
    ).toBe('OPEN')
    expect(stored[4], 'with a real CMP number minted for it').toMatch(/^CMP-/)

    expect(complaintCount(), 'exactly one row was written').toBe(before + 1)

    // And `subject` really is enforced — the one arm `j6` already covers,
    // repeated here in one line because without it this test would read as
    // "nothing at all is required", which is a different and false claim.
    const noSubject = await restPost(page, '/complaints', {
      description: `${PREFIX} — description present, subject absent`,
    })
    expect(noSubject.status(), 'omitting `subject` IS refused').toBe(400)
    expect(complaintCount(), 'and that refusal wrote nothing').toBe(before + 1)
  })

  test('KNOWN DEFECT CMP-D2 · TC-06-01 steps 3-5 — description, product and lot are each accepted when absent, one field at a time', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const page = await pool.page(browser, AUTH.complaintOwner)

    // ONE FIELD AT A TIME, which is what makes this more than the test above.
    // A single "everything missing" probe cannot distinguish "the route ignores
    // classification wholesale" from "these three specific fields are
    // unenforced". The protocol asks about three fields individually, so each
    // gets its own arm, each derived from a body that is otherwise COMPLETE —
    // every other field the create form collects is present, so the only thing
    // that could cause a refusal is the omission under test.
    const complete = {
      subject: `${PREFIX} complete body`,
      description: 'CMP-J18 — a full narrative of the complaint as received.',
      productId: sqlValue(
        `SELECT product_id FROM complaints WHERE id = ${q(COMPARATOR_ID)}`,
      ),
      batchLotSerial: 'LOT-E2E-J18-001',
      ownerId: USERS.complaintOwner.id,
    }
    expect(complete.productId, 'the §47c fixture gives us a real product id').toBeTruthy()

    const arms = [
      { omit: 'description', step: 'step 3', column: 'description' },
      { omit: 'productId', step: 'step 4', column: 'product_id' },
      { omit: 'batchLotSerial', step: 'step 5', column: 'batch_lot_serial' },
    ]

    for (const arm of arms) {
      const before = complaintCount()
      const body = { ...complete, subject: `${PREFIX} missing ${arm.omit}` }
      delete body[arm.omit]

      const res = await restPost(page, '/complaints', body)
      expect(
        res.status(),
        `KNOWN DEFECT CMP-D2 (TC-06-01 ${arm.step}): a complaint with no \`${arm.omit}\` is ACCEPTED where the protocol requires a refusal — ${await errorMessage(res)}`,
      ).toBe(201)

      const id = (await res.json()).complaint.id
      expect(
        sqlValue(
          `SELECT coalesce(${arm.column}::text,'NULL') FROM complaints WHERE id = ${q(id)}`,
        ),
        `and the record is stored with a NULL ${arm.column}`,
      ).toBe('NULL')
      expect(complaintCount(), 'the row really was written').toBe(before + 1)
    }

    // THE UI TELLS A DIFFERENT STORY, and the disagreement is the defect.
    // Asserted through the real create form rather than by reading the
    // component, because "the field is marked required" is only meaningful if
    // the form actually withholds submission — which it does.
    const ui = await pool.page(browser, AUTH.complaintOwner)
    const before = complaintCount()
    await ui.goto('/complaints/create', { waitUntil: 'domcontentloaded' })

    const subjectInput = ui.getByRole('textbox').first()
    await expect(subjectInput, 'the create form rendered').toBeVisible({ timeout: 60_000 })
    await subjectInput.fill(`${PREFIX} UI subject only`)
    await ui.getByRole('button', { name: 'Create Complaint' }).click()

    // The form refuses — so a person cannot produce the record the API just
    // produced three times. That asymmetry is what an interface-only control
    // looks like from the outside.
    await expect(
      ui,
      'the UI stays on the create page — its own required-rules refuse the submit',
    ).toHaveURL(/\/complaints\/create/, { timeout: 20_000 })
    expect(
      complaintCount(),
      'KNOWN DEFECT CMP-D2: the INTERFACE enforces what the SERVER does not — the same payload is refused here and accepted over REST',
    ).toBe(before)
  })

  test('the gap is ENFORCEMENT, not capability — a fully classified complaint round-trips every field', async () => {
    // WHY THIS TEST IS HERE. Without it, the two above support a wrong reading:
    // that `complaints` is a thin intake table which cannot carry product and
    // lot, and that the protocol is asking for something the product does not
    // do. It is not. §47c seeds a complaint carrying all four fields, written
    // through the same columns the create route writes, and every one reads
    // back.
    //
    // The distinction drives the corrective action: an unsupported field needs
    // a schema change, an unenforced one needs three `.optional()` calls
    // removed and a matching NOT NULL. This test says which it is.
    const row = sqlRow(
      `SELECT subject, description, coalesce(product_id::text,'NULL'),
              coalesce(batch_lot_serial,'NULL'), status_id
         FROM complaints WHERE id = ${q(COMPARATOR_ID)} AND deleted_at IS NULL`,
    )
    expect(row, 'the §47c comparator fixture is seeded').toBeTruthy()
    expect(row[0]).toContain('fully classified at intake')
    expect(row[1], 'description is carried').toBeTruthy()
    expect(row[2], 'product is carried, as a real FK value').not.toBe('NULL')
    expect(row[3], 'and the lot is carried').toBe('LOT-E2E-CMP-001')

    // The product FK resolves — a stored id that pointed at nothing would make
    // "the field is supported" an overstatement.
    expect(
      sqlValue(
        `SELECT count(*) FROM products p JOIN complaints c ON c.product_id = p.id
          WHERE c.id = ${q(COMPARATOR_ID)} AND p.deleted_at IS NULL`,
      ),
      'and the stored product resolves to a real product row',
    ).toBe('1')
  })
})
