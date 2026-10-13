// FORMS-F7 · URS-WFL-03 — rendering an OLD record against a SUPERSEDED form
// version. Partly a green gate, partly a DEFECT PIN.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE REQUIREMENT, AND THE FIRST THING THAT HAS TO BE SAID ABOUT IT
//
// URS-WFL-03 asks that a form template be versioned and that an old record be
// readable against the version it was filed under. `f5` already covers the
// storage-layer half: `enforce_form_template_integrity` refuses a backwards
// `version` move, with the HINT that says exactly why —
//
//   "Submitted records freeze template_version; two schemas answering to one
//    number cannot be told apart afterwards."
//
// What `f5` does NOT cover is the RENDER. And that is where this sits, because
// the render is where the requirement is actually kept or broken.
//
// ─────────────────────────────────────────────────────────────────────────────
// THERE IS NO SUPERSEDED VERSION. MEASURED, NOT ASSUMED.
//
// Before anything can be said about "rendering against a superseded version",
// it has to be established what a superseded version IS in this product. The
// answer, measured on app-db 2026-09-23 and in the migrations:
//
//   • There is NO `form_template_versions` table. Zero hits repo-wide; the
//     migration list has document-versions, workflow-versions and
//     audit-standard-versions, and nothing for form templates.
//   • `form_templates.version` is a plain `smallint NOT NULL DEFAULT 1`
//     (migration 20260918021660), bumped IN PLACE. There are no history rows.
//   • `form_statuses` is DRAFT / ACTIVE / ARCHIVED. There is no SUPERSEDED
//     status. `formTemplates.js` states the intent outright: "Archive-only
//     lifecycle: templates/blocks are never deleted … archived rows serve as
//     the version history."
//
// So "superseding" a form template means: its schema is overwritten and its
// version integer goes up. The OLD schema survives in exactly one place — the
// copy each record froze for itself. That makes the record's own frozen column
// the entire version-pinning mechanism, and it is what the first test below
// asserts. (`records.form_schema` + `records.template_version` for plain
// submissions; `records.schema_snapshot` for module records — two columns, two
// writers, documented in the migration's own COMMENT ON COLUMN.)
//
// ─────────────────────────────────────────────────────────────────────────────
// THE DEFECT — FORMS-D1
//
// The database keeps the old schema faithfully. The browser then ignores it.
//
//   src/components/records/RecordPreview.vue:35
//     const schema = computed(() => template.value?.schema || [])
//
// That is the component `RecordsTable.vue:207` opens when a user clicks a row
// in the App Builder Submissions register — the only way to read a plain
// submission in the product. It resolves the LIVE template and renders the
// stored `payload` against TODAY'S schema. No `formSchema` fallback, no
// `schemaSnapshot` fallback. `src/components/formTemplate/formTemplateRecords.vue:70`
// does the same for the per-template register, and drives the dynamic columns,
// the inline-edit form and the PDF export from it.
//
// The root cause is one layer lower and is why this cannot be dismissed as a
// one-line oversight: `qms-app/models/record.js` declares `schemaSnapshot` and
// does NOT declare `formSchema` or `templateVersion` as `@Property`. The
// SyncEngine only syncs declared properties, so the frozen schema of a PLAIN
// submission is not merely unread by the browser — it is unreachable from it.
// And `schemaSnapshot`, the one frozen column the client CAN see, is written
// only by `moduleRecordService` (at Start, for module records) and is therefore
// NULL for every plain submission ever made.
//
// The contrast is what makes this a defect rather than a design choice: the
// module-record viewer gets it right, in the same repository, with a comment
// explaining why —
//
//   src/components/modules/GenericModulePageId.vue:31
//     const fields = computed(() => record.value?.schemaSnapshot || template.value?.schema || [])
//     // "…so a later design change never rewrites what an existing record
//     //  shows (user report 2026-08-27)."
//
// Same requirement, two viewers, opposite answers.
//
// ─────────────────────────────────────────────────────────────────────────────
// HOW THIS FILE IS WRITTEN, AND WHAT WOULD HAVE BEEN DISHONEST
//
// The tempting shortcut is to assert version pinning on the MODULE record
// viewer — it works, it is the same requirement, and the file would be green.
// That would be reporting the half that passes and calling the requirement
// covered. So the plain-submission path is pinned AS IT BEHAVES, with a
// `KNOWN DEFECT FORMS-D1:` marker, and the working module path runs beside it
// as the CONTROL — which is also the proof that the defect is a defect and not
// a limitation of the platform.
//
// When FORMS-D1 is fixed the defect test goes RED. That is the signal to invert
// it, not to loosen it.
import fs from 'node:fs'
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { createPersonaPool } from '../fixtures/records.js'

const pool = createPersonaPool()

// Own id namespace — `e2e6f900-…` is used by nothing else.
const T = {
  templateId: 'e2e6f900-0000-4000-8000-000000000001',
  code: 'E2EVER',
  title: 'E2E Version Pinning Form',
  recordId: 'e2e6f900-0000-4000-8000-000000000101',
  recordNumber: 'E2EVER-9001',
}

// v1 — the schema the record is filed against. Its second field is the one that
// disappears on the way to v2, and is therefore the whole experiment: a field
// that exists in the frozen copy and NOT in the live one.
const V1_SCHEMA = [
  { name: 'verSubject', type: 'input', label: 'Version Subject', required: false },
  { name: 'verRetired', type: 'input', label: 'Retired In V2', required: false },
]
// v2 — the supersession. `verRetired` is gone and `verAdded` is new, so the two
// schemas differ in BOTH directions. A one-directional change (only removal, or
// only addition) could be explained away by a renderer that merely unions the
// schema with the payload's own keys.
const V2_SCHEMA = [
  { name: 'verSubject', type: 'input', label: 'Version Subject', required: false },
  { name: 'verAdded', type: 'input', label: 'Added In V2', required: false },
]

const json = (o) => JSON.stringify(o).replace(/'/g, "''")

function setTemplate(schema, version) {
  sql(`
    INSERT INTO form_templates (id, company_id, title, code, kind, status_id, is_module,
                                internal_name, version, config, schema, document_type_id,
                                created_at, updated_at)
    VALUES ('${T.templateId}', '${COMPANY_ID}', '${T.title}', '${T.code}', 'FORM', 'ACTIVE',
            false, NULL, ${version}, '{"layout":"standard"}'::jsonb, '${json(schema)}'::jsonb,
            'FORM', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE
      SET schema = EXCLUDED.schema, version = EXCLUDED.version, status_id = 'ACTIVE',
          deleted_at = NULL;`)
}

/** The record, filed against v1 and sealing v1's schema — exactly as `insertRecord` does. */
function fileRecordAgainstV1() {
  sql(`
    DELETE FROM analytics_field_values WHERE record_id = '${T.recordId}';
    DELETE FROM records WHERE id = '${T.recordId}';
    INSERT INTO records (id, company_id, template_id, module_key, record_number, document_type_id,
                         status_id, user_id, payload, form_schema, template_version,
                         created_at, updated_at)
    VALUES ('${T.recordId}', '${COMPANY_ID}', '${T.templateId}', NULL, '${T.recordNumber}', 'FORM',
            'DRAFT', '${USERS.author.id}',
            '{"verSubject":"filed under v1","verRetired":"this answer belongs to a field v2 deleted"}'::jsonb,
            '${json(V1_SCHEMA)}'::jsonb, 1, NOW(), NOW());`)
}

/** Field names in a record's FROZEN schema, in order. */
function frozenFields(recordId) {
  const out = sql(
    `SELECT string_agg(f->>'name', ',' ORDER BY ord)
       FROM records r, LATERAL jsonb_array_elements(r.form_schema) WITH ORDINALITY AS a(f, ord)
      WHERE r.id = '${recordId}'`,
  )
  return out ? out.split(',') : []
}

/** Field names in the LIVE template schema, in order. */
function liveFields(templateId) {
  const out = sql(
    `SELECT string_agg(f->>'name', ',' ORDER BY ord)
       FROM form_templates t, LATERAL jsonb_array_elements(t.schema) WITH ORDINALITY AS a(f, ord)
      WHERE t.id = '${templateId}'`,
  )
  return out ? out.split(',') : []
}

test.beforeAll(() => {
  setTemplate(V1_SCHEMA, 1)
  fileRecordAgainstV1()
})
test.afterAll(async () => {
  await pool.close()
  sql(`
    DELETE FROM analytics_field_values WHERE record_id = '${T.recordId}';
    DELETE FROM records WHERE template_id = '${T.templateId}';
    DELETE FROM record_counters WHERE template_id = '${T.templateId}';
    DELETE FROM form_templates WHERE id = '${T.templateId}';`)
})

test.describe('FORMS-F7 — version pinning when a form template is superseded', () => {
  test('the DATABASE pins correctly: superseding the template leaves the old record’s frozen schema and version untouched', () => {
    // Premise, measured rather than assumed — the record and the template start
    // in agreement, which is what makes the divergence below meaningful.
    expect(frozenFields(T.recordId), 'the record froze v1’s two fields').toEqual([
      'verSubject',
      'verRetired',
    ])
    expect(liveFields(T.templateId), 'and the live template still holds them').toEqual([
      'verSubject',
      'verRetired',
    ])
    expect(
      Number(sqlValue(`SELECT template_version FROM records WHERE id = '${T.recordId}'`)),
      'the record names the version it was filed against',
    ).toBe(1)

    // ── Supersede. This is what "a superseded form version" IS here: the
    // schema is overwritten in place and the integer goes up. There is no
    // second row to point at, which is exactly why the freeze has to carry it.
    setTemplate(V2_SCHEMA, 2)

    expect(liveFields(T.templateId), 'the live template is now v2’s field set').toEqual([
      'verSubject',
      'verAdded',
    ])
    expect(
      Number(sqlValue(`SELECT version FROM form_templates WHERE id = '${T.templateId}'`)),
      'and its version advanced',
    ).toBe(2)

    // ── The pin itself. Both directions of the change are checked: the retired
    // field is STILL in the frozen copy, and the added field is NOT. A
    // renderer that merely unioned the live schema with the payload's own keys
    // would satisfy the first and fail the second.
    expect(
      frozenFields(T.recordId),
      'the record’s frozen schema is untouched by the supersession — it is still v1',
    ).toEqual(['verSubject', 'verRetired'])
    expect(
      Number(sqlValue(`SELECT template_version FROM records WHERE id = '${T.recordId}'`)),
      'and it still names v1, so the two can be told apart afterwards',
    ).toBe(1)

    // The answer to the retired question survives too. Without this, "the
    // schema is pinned" could still coexist with a payload that had been
    // migrated or pruned.
    expect(
      sqlValue(`SELECT payload->>'verRetired' FROM records WHERE id = '${T.recordId}'`),
      'the answer given to a field v2 deleted is still stored',
    ).toBe('this answer belongs to a field v2 deleted')

    // And the guard f5 covers, re-stated where it belongs: the version cannot
    // be walked back to make the two agree again.
    //
    // The REFUSAL is asserted, not just its after-effect. An
    // `EXCEPTION WHEN OTHERS` wrapper swallows the raise, so a run in which the
    // trigger had been dropped and the UPDATE silently did nothing would be
    // indistinguishable from a run in which it fired. `sql()` throws on a
    // non-zero psql exit (ON_ERROR_STOP=1), so the raise is caught here
    // directly, and the message is matched against the product's own words.
    let refusal = null
    try {
      sql(`UPDATE form_templates SET version = 1 WHERE id = '${T.templateId}'`)
    } catch (err) {
      refusal = `${err.stderr ?? ''}${err.message ?? ''}`
    }
    expect(
      refusal,
      'the version cannot go backwards — enforce_form_template_integrity must RAISE, ' +
        'not merely leave the row alone (f5 pins the raise; this pins it at the point of use)',
    ).toBeTruthy()
    expect(
      refusal,
      'and it says why, in the HINT that names the freeze this whole file is about',
    ).toMatch(/version cannot go backwards/i)

    // …and the row is genuinely unchanged, so the refusal was atomic.
    expect(
      Number(sqlValue(`SELECT version FROM form_templates WHERE id = '${T.templateId}'`)),
      'the refused UPDATE left the version where it was',
    ).toBe(2)
  })

  test('🔴 KNOWN DEFECT FORMS-D1 — the submission viewer renders the LIVE schema, not the frozen one', async ({
    browser,
  }) => {
    // Premise: the database really is holding two different answers right now.
    // Re-established inside this test rather than inherited, because Playwright
    // restarts the worker after a failed test and re-runs beforeAll — which
    // would reset the template to v1 and quietly make this test about nothing.
    setTemplate(V2_SCHEMA, 2)
    expect(frozenFields(T.recordId), 'frozen = v1').toEqual(['verSubject', 'verRetired'])
    expect(liveFields(T.templateId), 'live = v2').toEqual(['verSubject', 'verAdded'])

    const page = await pool.page(browser, AUTH.author)
    for (const budget of [60_000, 45_000]) {
      await page.goto('/records?tab=submissions').catch(() => {})
      const ready = await page
        .getByText(T.recordNumber, { exact: false })
        .first()
        .waitFor({ state: 'visible', timeout: budget })
        .then(() => true)
        .catch(() => false)
      if (ready) break
    }

    // Open the record. A row click is the only way into the preview —
    // RecordsTable.vue:161 `@rowClick="openPreview"`.
    await page.getByRole('row').filter({ hasText: T.recordNumber }).first().click()

    // The preview is up. Anchored on the shared field, which both versions
    // carry — so this wait cannot itself be decided by the defect.
    await expect(
      page.getByText('Version Subject', { exact: false }).first(),
      'the record preview opened',
    ).toBeVisible({ timeout: 45_000 })

    // ── The defect, pinned in both directions ──────────────────────────────
    //
    // KNOWN DEFECT FORMS-D1: RecordPreview.vue:35 is
    //   const schema = computed(() => template.value?.schema || [])
    // with no `formSchema` / `schemaSnapshot` fallback. Underneath it,
    // qms-app/models/record.js declares `schemaSnapshot` but NOT `formSchema`,
    // so the frozen schema of a plain submission is not even synced to the
    // browser. The record therefore renders against whatever the template says
    // today.
    //
    // Asserted as it BEHAVES. Both halves are needed: on their own, "the
    // retired field is missing" is also what a still-loading preview looks
    // like, and "the v2 field is present" is also what a correct render of a
    // record filed under v2 would look like. Together they can only mean the
    // live schema was used.
    await expect(
      page.getByText('Added In V2', { exact: false }).first(),
      'KNOWN DEFECT FORMS-D1: a field added AFTER this record was filed is rendered on it',
    ).toBeVisible({ timeout: 20_000 })

    await expect(
      page.getByText('Retired In V2', { exact: false }),
      'KNOWN DEFECT FORMS-D1: the field this record actually answered is NOT rendered — the stored answer is unreadable in the product',
    ).toHaveCount(0)

    // The answer is still in Postgres. That is what makes this a RENDER defect
    // rather than data loss, and it is the difference between a one-line fix
    // and a migration.
    expect(
      sqlValue(`SELECT payload->>'verRetired' FROM records WHERE id = '${T.recordId}'`),
      'the answer is still stored — nothing was lost, it is only unreadable',
    ).toBe('this answer belongs to a field v2 deleted')
  })

  test('CONTROL — the client-side cause: `formSchema` is not a synced property of the Record model', () => {
    // Why FORMS-D1 is not a one-line fix, stated as a check rather than as
    // prose. The SyncEngine only ships declared `@Property` fields to
    // IndexedDB, so a `record.formSchema` fallback added to RecordPreview
    // would read `undefined` even though Postgres holds the value.
    //
    // This is asserted against the MODEL FILE because there is no runtime
    // surface for "a column the client cannot see" — its whole signature is
    // absence. Reading the source is the only honest way to state it, and it
    // fails the moment the property is added, which is precisely when this
    // test should be revisited.
    const model = fs.readFileSync(
      new URL('../../models/record.js', import.meta.url),
      'utf8',
    )
    expect(
      /@Property\([^)]*\)\s*schemaSnapshot/.test(model),
      'the client model DOES declare schemaSnapshot — the module-record freeze it reads',
    ).toBe(true)
    expect(
      /@Property\([^)]*\)\s*formSchema/.test(model),
      'KNOWN DEFECT FORMS-D1 (root cause): the client model does NOT declare formSchema, so a plain submission’s frozen schema never reaches the browser',
    ).toBe(false)

    // …and the column it cannot see is populated. Absent this, the missing
    // property would be a reasonable omission rather than a gap.
    expect(
      sqlValue(
        `SELECT count(*) FROM records
          WHERE form_schema IS NOT NULL AND module_key IS NULL AND company_id = '${COMPANY_ID}'`,
      ),
      'plain submissions in this tenant DO carry a frozen schema the browser cannot read',
    ).not.toBe('0')

    // The sibling that gets it right, named so the fix has a model to copy.
    const generic = fs.readFileSync(
      new URL('../../src/components/modules/GenericModulePageId.vue', import.meta.url),
      'utf8',
    )
    expect(
      generic.includes('schemaSnapshot'),
      'the MODULE record viewer prefers the frozen snapshot — same requirement, opposite answer, same repo',
    ).toBe(true)
  })
})
