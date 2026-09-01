// CF-3 — the split at the heart of the module: authoring the SCHEMA is a
// different permission from filling in the ANSWERS.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE CONCEPT, AND WHY GETTING IT WRONG IS THE INTERESTING FAILURE
//
// Custom Fields owns two tables that look alike and are governed by opposite
// principles:
//
//   entity_field_sets    ONE row per (company, entity_type). The FormBuilder
//                        schema an admin authors under Settings → Custom Fields.
//                        Configuration. Gated on `custom_fields:manage`, and
//                        correctly gated since it was written.
//
//   entity_field_values  ONE row per host record. That record's answers,
//                        autosaved by the same edit affordance as the rest of
//                        its detail page. NOT configuration — it is the record.
//                        Gated on the HOST record's module since the L-2 fix.
//
// The tempting mistake is to gate both on `custom_fields:manage`, since both
// tables belong to the Custom Fields module. That would mean only Quality admins
// could fill in an NC's own custom fields — a worse product than the defect L-2
// was closing, and the reason the fix follows the host module instead.
//
// The mirror mistake is the one L-2 actually was: gating the answers on nothing,
// because "the schema next to it is gated".
//
// So the property worth pinning is not either policy on its own. It is that the
// two permissions are INDEPENDENT IN BOTH DIRECTIONS — neither implies the other
// — and this file proves it with two personas who are each other's negative
// image, against the same two tables in the same run.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE PERSONAS, AND WHY ONE OF THEM HAD TO BE INVENTED
//
// `cfSchemaAdmin` (`cfschema@e2e.test`) is created by `fixtures/customFields.js`
// and holds `custom_fields:manage` AND NOTHING ELSE. It exists because measured
// on `app-db` on 2026-09-01, NOT ONE of the 30 seeded E2ELAB personas holds a
// `custom_fields` grant — so before this fixture, the schema table's gate could
// only be probed through the owner bypass, which proves the bypass works and
// says nothing about the permission.
//
// `reviewer` is the negative image: `ncr:read` + `ncr:update` and no
// `custom_fields` grant.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS MEASURED TO JUSTIFY THE ASSERTIONS (app-db, 2026-09-01)
//
//   persona          efs SELECT  efs UPDATE  efs INSERT  efs DELETE  efv sel(NC)  efv upd(NC)
//   cfSchemaAdmin         all         1        accepted       1            0            0
//   reviewer              all         0        DENIED 42501   0          291            1
//   author                all         0        DENIED 42501   0          291            1
//   controller            all         0        DENIED 42501   0            0            0
//   noAccess              all         0        DENIED 42501   0            0            0
//
// Read the two shaded columns against each other: `cfSchemaAdmin` writes the
// schema and cannot touch a single answer row; `reviewer` writes the answers and
// cannot touch the schema. Neither permission is a superset of the other, and
// neither is a superset of nothing.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE ONE ASYMMETRY, PINNED ON PURPOSE
//
// `entity_field_set_select_rls` is `company_id = …` and NOTHING more — every
// member of the tenant reads every schema row. That is deliberate and
// load-bearing: `CustomFieldsCard` live-queries the schema on every host detail
// page, so a reader who can open an NC must be able to read the field
// DEFINITIONS or the card renders empty for them. Only the three write verbs ask
// for `custom_fields:manage`. It is pinned here so a well-meaning tightening
// that "makes the schema table consistent with the values table" has to break a
// test that explains why it is not.
import { test, expect } from '@playwright/test'
import { COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser } from '../fixtures/db.js'
import {
  CF_USERS,
  affectedRows,
  clearSchema,
  deniedByPolicy,
  hasPermission,
  installCustomFieldPersonas,
  removeValueRows,
  schemaFor,
  schemaRowsVisibleTo,
  seedSchema,
  seedValueRow,
  valueRowsInTable,
  valueRowsVisibleTo,
} from '../fixtures/customFields.js'

// `Complaint` is the probe entity type for the SCHEMA half throughout this
// file, and the choice is not arbitrary: the E2E tenant holds ZERO Complaint
// records and no other suite touches them, so seeding and deleting a Complaint
// schema row cannot make an "Additional information" card appear on any page
// another concurrently-running project is asserting against. (Seeding a
// `Nonconformance` schema would — see the blast-radius note in the fixture.)
const SCHEMA_ENTITY = 'Complaint'

const PROBE_SCHEMA = [
  { type: 'input', name: 'cf3Probe', label: 'CF-3 probe field', required: false, width: 'full' },
]

const probeValueRows = []

test.beforeAll(() => installCustomFieldPersonas())

test.afterAll(() => {
  removeValueRows(probeValueRows)
  clearSchema(SCHEMA_ENTITY)
})

test.describe('CF-3 — authoring the schema and filling the answers are different rights', () => {
  test('the two personas are each other’s negative image', () => {
    // Stated first, so every result below reads as a permission outcome. If a
    // re-seed ever widens either role, this fails here with the reason named
    // rather than three tests later as a puzzling row count.
    expect(
      hasPermission(CF_USERS.cfSchemaAdmin.id, 'custom_fields', 'manage'),
      'the schema admin holds custom_fields:manage',
    ).toBe(true)
    expect(
      hasPermission(CF_USERS.cfSchemaAdmin.id, 'ncr', 'read'),
      '…and no grant on any host module',
    ).toBe(false)

    expect(
      hasPermission(USERS.reviewer.id, 'ncr', 'update'),
      'the reviewer holds ncr:update',
    ).toBe(true)
    expect(
      hasPermission(USERS.reviewer.id, 'custom_fields', 'manage'),
      '…and no custom_fields grant',
    ).toBe(false)
  })

  test('custom_fields:manage authors the schema — and nobody else can', () => {
    clearSchema(SCHEMA_ENTITY)

    const insert = (userId) =>
      sqlAsAppUser(
        `INSERT INTO entity_field_sets (id, company_id, entity_type, schema, created_at, updated_at)
         VALUES (gen_random_uuid(), '${COMPANY_ID}', '${SCHEMA_ENTITY}', '[]'::jsonb, now(), now());`,
        { userId, companyId: COMPANY_ID },
      )

    // The denials first, while the row genuinely does not exist yet. INSERT is
    // the verb that fails LOUDLY on this table — there is no pre-existing row
    // for the SELECT policy to hide, so WITH CHECK is always reached and a
    // refusal is SQLSTATE 42501 rather than a silent zero.
    for (const [label, id] of [
      ['reviewer', USERS.reviewer.id],
      ['author', USERS.author.id],
      ['controller', USERS.controller.id],
      ['noAccess', USERS.noAccess.id],
    ]) {
      expect(
        deniedByPolicy(insert(id)),
        `${label} cannot create a custom-field schema (raised, not silently dropped)`,
      ).toBe(true)
    }
    expect(schemaFor(SCHEMA_ENTITY), 'and none of them left a row behind').toBeNull()

    // The pair — the identical statement, one grant apart.
    const admitted = insert(CF_USERS.cfSchemaAdmin.id)
    expect(admitted.ok, `the schema admin's insert was accepted (stderr: ${admitted.error})`).toBeTruthy()
    expect(affectedRows(admitted, 'INSERT')).toBe(1)
    expect(schemaFor(SCHEMA_ENTITY), 'the schema row now exists').toEqual([])

    // UPDATE — the verb the FormBuilder's Save actually uses, since
    // `bootstrapCompanyDefaults` seeds one empty row per entity for new tenants
    // and `CustomFieldsHome.saveSet` finds-then-updates.
    const author = (userId) =>
      sqlAsAppUser(
        `UPDATE entity_field_sets SET schema = '${JSON.stringify(PROBE_SCHEMA)}'::jsonb
          WHERE company_id = '${COMPANY_ID}' AND entity_type = '${SCHEMA_ENTITY}';`,
        { userId, companyId: COMPANY_ID },
      )

    for (const [label, id] of [
      ['reviewer', USERS.reviewer.id],
      ['author', USERS.author.id],
      ['noAccess', USERS.noAccess.id],
    ]) {
      expect(
        affectedRows(author(id)),
        `${label} cannot rewrite the schema — and this zero is NOT the SELECT policy hiding the row`,
      ).toBe(0)
    }
    // …which the previous line asserts by implication and this one asserts
    // outright. `entity_field_set_select_rls` is company-only, so all three of
    // them READ the row they just failed to write: the UPDATE policy is what
    // refused them, not invisibility. That distinction is the whole reason this
    // file exists in the same suite as CF-1.
    for (const label of ['reviewer', 'author', 'noAccess']) {
      expect(
        schemaRowsVisibleTo(USERS[label].id),
        `${label} can SEE the schema row they cannot write`,
      ).toBeGreaterThan(0)
    }
    expect(schemaFor(SCHEMA_ENTITY), 'so the schema is still empty').toEqual([])

    expect(
      affectedRows(author(CF_USERS.cfSchemaAdmin.id)),
      'and custom_fields:manage writes it',
    ).toBe(1)
    expect(schemaFor(SCHEMA_ENTITY), 'the authored field landed').toEqual(PROBE_SCHEMA)
  })

  test('…and the schema admin cannot touch a single ANSWER row', () => {
    // The other half of the split, and the half that would be missing if the
    // fix had gated `entity_field_values` on `custom_fields:manage`. Under that
    // (wrong) design this persona would read all 291 NC answer rows; under the
    // shipped design she reads none, because she holds no `ncr` grant.
    const inTable = valueRowsInTable('Nonconformance')
    expect(inTable, 'there are NC answers for her not to read').toBeGreaterThan(0)

    expect(
      valueRowsVisibleTo(CF_USERS.cfSchemaAdmin.id, 'Nonconformance'),
      'custom_fields:manage reads no NC answers',
    ).toBe(0)

    const row = seedValueRow('Nonconformance')
    probeValueRows.push(row)

    const write = (userId) =>
      sqlAsAppUser(
        `UPDATE entity_field_values SET payload = payload || '{"cf3":1}'::jsonb WHERE id = '${row}';`,
        { userId, companyId: COMPANY_ID },
      )

    expect(
      affectedRows(write(CF_USERS.cfSchemaAdmin.id)),
      'nor writes one',
    ).toBe(0)

    // The pair, on the SAME row in the same run — without it the zero above is
    // also what a nonexistent row looks like.
    expect(
      affectedRows(write(USERS.reviewer.id)),
      'while the reviewer — who cannot author the schema at all — writes the answers',
    ).toBe(1)
  })

  test('reading the schema is open to the tenant, by design (pinned, not accidental)', () => {
    // `entity_field_set_select_rls` is `company_id = …` and nothing more.
    // `CustomFieldsCard` live-queries the schema on EVERY host detail page, so a
    // reader who can open an NC has to be able to read the field definitions or
    // the card renders empty for them. Tightening this to `custom_fields:manage`
    // would look like consistency and would blank the card for almost everyone.
    seedSchema(SCHEMA_ENTITY, PROBE_SCHEMA)

    const everyone = ['noAccess', 'auditor', 'reviewer', 'author', 'controller', 'capaSiteEditor']
    for (const persona of everyone) {
      expect(
        schemaRowsVisibleTo(USERS[persona].id),
        `${persona} reads the tenant's schema rows regardless of grants`,
      ).toBeGreaterThan(0)
    }
    expect(
      schemaRowsVisibleTo(CF_USERS.cfSchemaAdmin.id),
      'as does the one persona who may write them',
    ).toBeGreaterThan(0)

    // The paired half: openness is READ-ONLY. If the SELECT policy is ever
    // widened into the write policies by accident, this is what catches it.
    const del = sqlAsAppUser(
      `DELETE FROM entity_field_sets WHERE company_id = '${COMPANY_ID}' AND entity_type = '${SCHEMA_ENTITY}';`,
      { userId: USERS.author.id, companyId: COMPANY_ID },
    )
    expect(
      affectedRows(del, 'DELETE'),
      'a persona who reads every schema row deletes none of them',
    ).toBe(0)
    expect(schemaFor(SCHEMA_ENTITY), 'the schema survived').toEqual(PROBE_SCHEMA)
  })
})
