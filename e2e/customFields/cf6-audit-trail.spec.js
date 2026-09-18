// CF-6 — the audit trail on this module's three tables, which until 2026-09-01
// recorded nothing at all for an UPDATE.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FINDING THIS PINS
//
// L-3. All three triggers (`entity_field_values_audit_trigger`,
// `entity_field_sets_audit_trigger`, `option_sets_audit_trigger`) were attached
// and firing the whole time. The defect was one layer downstream, in the
// worker's field-tracking config:
//
//   * `entity_field_sets` and `entity_field_values` had NO registry entry and
//     fell through to `DEFAULT_TRACK_FIELDS = ['statusId','stateId','name',
//     'title','code']`. Neither table has ANY of those five columns, so
//     `hasRelevantChanges()` was false for every UPDATE and the entry was
//     dropped on the floor. INSERT/DELETE wrote a literal `{id}` and nothing
//     else.
//   * `option_sets` tracked `['name']`, so RENAMES were recorded and editing
//     the options themselves — the entire content of an option set — was not.
//
// Measurable consequence, on `app-db` today: 2,246 `EntityFieldValues` CREATE
// rows and, before the fix, ZERO UPDATE rows, across the tenant's whole history.
//
// The fix adds `registry/modules/customFields.js` and widens
// `registry/modules/configuration.js`:
//
//   entity_field_sets    entityType, schema, createdBy, deletedAt
//   entity_field_values  entityType, entityId, payload, formSchema, createdBy, deletedAt
//   option_sets          name, description, options, deletedAt
//
// all three with `actionMap: { deletedAt: softDeleteAction }`, which matters
// more than it looks: every one of these models is paranoid and the product
// never issues a real SQL `DELETE`, so `deleted_at` is the entire deletion story.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY EVERY PROBE IS TWO-SIDED HERE, AND WHAT THE NEGATIVE SIDE IS
//
// "An audit row appeared" is a weak assertion on its own: it is equally
// satisfied by a config that tracks EVERY column, which would drown the trail
// and defeat the point of `trackFields`. So each positive is paired with a
// write that must produce NOTHING — an `updated_at`-only touch, which changes a
// real column that is deliberately untracked.
//
// That negative has a timing problem this file solves without a sleep: proving
// "no row ever arrives" needs an upper bound, and a fixed wait is both slow and
// a lie. Instead the untracked write is followed by a TRACKED one, and the
// tracked one's row is used as the barrier — once the worker has demonstrably
// processed a LATER change to the same row, the earlier one is not in flight any
// more, and its absence is a fact rather than a race.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS MEASURED TO JUSTIFY THE ASSERTIONS (app-db, 2026-09-01)
//
// One `entity_field_values` row, driven through six writes, reading `audit_logs`
// after each:
//
//   INSERT                        -> CREATE, new_value_json = the whole row
//   UPDATE updated_at only        -> (nothing)
//   UPDATE payload                -> UPDATE  old {payload:{seed:1}} new {payload:{seed:2}}
//   UPDATE form_schema            -> UPDATE  old {formSchema:[]}    new {formSchema:[…]}
//   UPDATE deleted_at = now()     -> DELETE  old {deletedAt:null}   new {deletedAt:"…"}
//   UPDATE deleted_at = NULL      -> UPDATE  old {deletedAt:"…"}    new {deletedAt:null}
//
// and one `option_sets` row:
//
//   UPDATE options                -> UPDATE  old {options:["A","B"]} new {options:["A","C"]}
//   UPDATE deleted_at = now()     -> DELETE
//
// Attribution: `performed_by` is NULL for a superuser write and carries the user
// id when the write arrives through `app_user` with the request path's GUCs —
// i.e. through the path the product actually uses. Both are asserted.
//
// ─────────────────────────────────────────────────────────────────────────────
// L-6, AND WHY THIS FILE ASSERTS THE OPPOSITE OF THE HARDENING DOC
//
// §L-6 records the PLURAL `entity_type` (`EntityFieldValues`) as an open,
// platform-wide break leaving this module's rows unreachable through the audit
// trail's entity filter. That is a MIS-DIAGNOSIS: it checked
// `public.audit_entity_types` and missed `public.audit_entity_type_aliases`, the
// bridge that exists because the trigger writes the plural and the vocabulary is
// keyed on the singular. Verified live — all three of this module's types
// resolve alias → canonical → table → module → label, and across the entire
// trail only two values fail to resolve, both E2E artifacts. Migration
// `20260902400000-audit-entity-type-orphans.js` (applied) states the same and
// names this review as the source of the error.
//
// So the last test here asserts the RESOLUTION CHAIN, not the string — because
// the string on its own is exactly what made a working mechanism look broken.
import { test, expect } from '@playwright/test'
import { COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlRow, sqlValue, sqlAsAppUser } from '../fixtures/db.js'
import {
  AUDIT_ENTITY_TYPES,
  affectedRows,
  auditRows,
  dbNow,
  installCustomFieldPersonas,
  removeOptionSet,
  removeValueRows,
  seedOptionSet,
  seedValueRow,
  waitForAuditRow,
} from '../fixtures/customFields.js'

const created = { values: [], optionSets: [] }

test.beforeAll(() => installCustomFieldPersonas())

test.afterAll(() => {
  removeValueRows(created.values)
  for (const id of created.optionSets) removeOptionSet(id)
})

function newValueRow(payload) {
  const id = seedValueRow('Nonconformance', { payload, formSchema: [] })
  created.values.push(id)
  return id
}

test.describe('CF-6 — the trail records what changed, and only what changed', () => {
  test('an UPDATE to the answers is audited with a real old→new diff', async () => {
    const row = newValueRow({ seed: 1 })

    // The CREATE first — it is the row type the tenant already has 2,246 of, and
    // it is the half that always worked. Waiting for it also proves the worker
    // is alive, so a later "no row appeared" cannot be a dead queue.
    await waitForAuditRow({ entityType: AUDIT_ENTITY_TYPES.values, entityId: row, action: 'CREATE' })

    // ── the negative, which the positive after it will bound in time ──────────
    const beforeUntracked = dbNow()
    sql(`UPDATE entity_field_values SET updated_at = now() WHERE id = '${row}'`)

    // ── the positive: a tracked column, and the barrier for the negative ──────
    const since = dbNow()
    sql(`UPDATE entity_field_values SET payload = '{"seed":2}'::jsonb, updated_at = now() WHERE id = '${row}'`)
    const rows = await waitForAuditRow({
      entityType: AUDIT_ENTITY_TYPES.values,
      entityId: row,
      action: 'UPDATE',
      since,
    })

    expect(rows, 'exactly one UPDATE row for one tracked change').toHaveLength(1)
    expect(rows[0].oldValue, 'the trail carries what the answer WAS').toEqual({
      payload: { seed: 1 },
    })
    expect(rows[0].newValue, '…and what it BECAME').toEqual({ payload: { seed: 2 } })

    // Now the negative is safe to assert: the worker has demonstrably processed
    // a change made AFTER the untracked one, so the untracked one is not in
    // flight and its absence is a fact rather than a race.
    //
    // Asserted as a COUNT over the window spanning BOTH writes rather than as
    // "no row mentions updatedAt": if the untracked touch had been audited it
    // might have landed with any shape at all — an empty diff, a whole-row
    // snapshot — and a shape-specific filter would have missed it. Exactly one
    // row in a window containing exactly two writes is the assertion that
    // cannot be dodged.
    expect(
      auditRows({
        entityType: AUDIT_ENTITY_TYPES.values,
        entityId: row,
        since: beforeUntracked,
      }),
      'two writes, one tracked — exactly one audit row (trackFields is a filter, not a firehose)',
    ).toHaveLength(1)
  })

  test('the SEALED SCHEMA is tracked too, not just the answers', async () => {
    // `formSchema` is the snapshot the readonly view renders a closed record
    // from. Relabel a field inside it and the same stored answer displays under
    // a different question — a tamper that touches no answer at all and is
    // undetectable unless the snapshot is in the trail. That is why it is a
    // tracked field, and this is the test that says so.
    const row = newValueRow({ answer: 'unchanged' })
    await waitForAuditRow({ entityType: AUDIT_ENTITY_TYPES.values, entityId: row, action: 'CREATE' })

    const since = dbNow()
    sql(
      `UPDATE entity_field_values
          SET form_schema = '[{"name":"answer","label":"Relabelled question"}]'::jsonb,
              updated_at = now()
        WHERE id = '${row}'`,
    )
    const rows = await waitForAuditRow({
      entityType: AUDIT_ENTITY_TYPES.values,
      entityId: row,
      action: 'UPDATE',
      since,
    })
    expect(rows[0].newValue.formSchema, 'the relabelled snapshot is in the trail').toEqual([
      { name: 'answer', label: 'Relabelled question' },
    ])
    expect(
      rows[0].newValue.payload,
      '…and the answer itself is correctly absent, because it did not change',
    ).toBeUndefined()
  })

  test('a soft delete reads as DELETE, and a restore as UPDATE', async () => {
    // Every model here is paranoid and the product never issues a real SQL
    // DELETE, so without the `deletedAt: softDeleteAction` mapping the trail
    // would record destruction as an ordinary edit. On `option_sets` it CANNOT
    // be anything else — `rls.sql` grants `app_user` only INSERT/SELECT/UPDATE
    // on that table, so `deleted_at` is the entire deletion story there.
    const row = newValueRow({ seed: 'del' })
    await waitForAuditRow({ entityType: AUDIT_ENTITY_TYPES.values, entityId: row, action: 'CREATE' })

    const beforeDelete = dbNow()
    sql(`UPDATE entity_field_values SET deleted_at = now(), updated_at = now() WHERE id = '${row}'`)
    const deleted = await waitForAuditRow({
      entityType: AUDIT_ENTITY_TYPES.values,
      entityId: row,
      action: 'DELETE',
      since: beforeDelete,
    })
    expect(deleted[0].oldValue).toEqual({ deletedAt: null })
    expect(deleted[0].newValue.deletedAt, 'the delete carries a timestamp').toBeTruthy()

    // The pair — the same column moving the other way falls through to UPDATE.
    // Without it, "deletedAt is mapped to DELETE" is indistinguishable from
    // "every change to this row is called DELETE".
    const beforeRestore = dbNow()
    sql(`UPDATE entity_field_values SET deleted_at = NULL, updated_at = now() WHERE id = '${row}'`)
    const restored = await waitForAuditRow({
      entityType: AUDIT_ENTITY_TYPES.values,
      entityId: row,
      action: 'UPDATE',
      since: beforeRestore,
    })
    expect(restored[0].newValue).toEqual({ deletedAt: null })
  })

  test('option_sets records its OPTIONS changing, not only its name', async () => {
    // This is the half of L-3 the pack itself had gone stale on. An unrelated
    // Audit-logs cycle had already removed the phantom `stateId` trackField the
    // pack complained about — but what that fix left behind was
    // `trackFields: ['name']`, so a RENAME was audited and rewriting every
    // option in the set was invisible. The substance of the finding survived the
    // fix that appeared to close it.
    const id = seedOptionSet({ name: `CF-6 audit probe ${Date.now()}`, options: ['A', 'B'] })
    created.optionSets.push(id)
    await waitForAuditRow({ entityType: AUDIT_ENTITY_TYPES.optionSets, entityId: id, action: 'CREATE' })

    const since = dbNow()
    sql(`UPDATE option_sets SET options = '["A","C"]'::jsonb, updated_at = now() WHERE id = '${id}'`)
    const rows = await waitForAuditRow({
      entityType: AUDIT_ENTITY_TYPES.optionSets,
      entityId: id,
      action: 'UPDATE',
      since,
    })
    expect(rows[0].oldValue).toEqual({ options: ['A', 'B'] })
    expect(rows[0].newValue).toEqual({ options: ['A', 'C'] })
  })

  test('a write through the governed path is attributed to the user who made it', async () => {
    // The trail is only evidence if it names somebody. `performed_by` is read
    // from the session GUCs the API sets, so a superuser/REST write leaves it
    // NULL and a GraphQL write — the path the frontend actually uses — carries
    // the user id. Both halves are asserted, because a config that attributed
    // everything to NULL would satisfy a one-sided "the row exists" check.
    const row = newValueRow({ seed: 'attr' })
    await waitForAuditRow({ entityType: AUDIT_ENTITY_TYPES.values, entityId: row, action: 'CREATE' })

    const since = dbNow()
    const res = sqlAsAppUser(
      `UPDATE entity_field_values SET payload = '{"seed":"by-reviewer"}'::jsonb WHERE id = '${row}';`,
      { userId: USERS.reviewer.id, companyId: COMPANY_ID },
    )
    expect(affectedRows(res), 'the reviewer holds ncr:update, so the write lands').toBe(1)

    const rows = await waitForAuditRow({
      entityType: AUDIT_ENTITY_TYPES.values,
      entityId: row,
      action: 'UPDATE',
      since,
    })
    expect(rows[0].performedBy, 'the GraphQL-path write names the reviewer').toBe(USERS.reviewer.id)

    // …and the superuser half, on the same row, in the same run.
    const since2 = dbNow()
    sql(`UPDATE entity_field_values SET payload = '{"seed":"by-superuser"}'::jsonb, updated_at = now() WHERE id = '${row}'`)
    const rows2 = await waitForAuditRow({
      entityType: AUDIT_ENTITY_TYPES.values,
      entityId: row,
      action: 'UPDATE',
      since: since2,
    })
    expect(
      rows2[0].performedBy,
      'a superuser/REST write has no session user to attribute to',
    ).toBeNull()
  })

  test('the plural entity_type RESOLVES — L-6 is a mis-diagnosis, pinned as such', () => {
    // `handleDefault` stamps `toPascalCase(table)` without singularizing, so the
    // trail holds `EntityFieldValues` while `audit_entity_types` is keyed
    // `EntityFieldValue`. §L-6 read that as a break. It is not: the plural is
    // exactly what `audit_entity_type_aliases` exists to absorb, and its rows
    // for these three tables are marked `source = 'TRIGGER'` — i.e. registered
    // BECAUSE the trigger writes the plural.
    //
    // Asserted as the whole chain rather than as "the alias row exists", because
    // an alias pointing at a canonical with no `audit_entity_types` row, or one
    // whose `module_id` is NULL, would leave the trail's module filter exactly
    // as broken as §L-6 claimed while passing a shallower check.
    for (const [table, plural, singular, moduleId] of [
      ['entity_field_values', AUDIT_ENTITY_TYPES.values, 'EntityFieldValue', 'custom_fields'],
      ['entity_field_sets', AUDIT_ENTITY_TYPES.sets, 'EntityFieldSet', 'custom_fields'],
      ['option_sets', AUDIT_ENTITY_TYPES.optionSets, 'OptionSet', 'option_sets'],
    ]) {
      // Four COLUMNS, read with `sqlRow`, not one concatenated string read with
      // `sqlValue`: `sqlValue` splits psql's unaligned output on `|` and hands
      // back the first field, so a pipe-joined projection silently returns only
      // its first component.
      const resolved = sqlRow(
        `SELECT a.canonical, t.table_name, coalesce(t.module_id, '<NULL>'), t.label
           FROM audit_entity_type_aliases a
           JOIN audit_entity_types t ON t.id = a.canonical
          WHERE a.alias = '${plural}'`,
      )
      expect(
        resolved,
        `${plural} resolves through the alias table to a labelled, module-attributed type`,
      ).toEqual([singular, table, moduleId, labelFor(singular)])
    }

    // The other side: the plural really IS what gets written, so the alias is
    // load-bearing rather than vestigial. If a future fix singularizes
    // `toPascalCase`, this is the assertion that has to be changed deliberately.
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM audit_logs
            WHERE company_id = '${COMPANY_ID}' AND entity_type = '${AUDIT_ENTITY_TYPES.values}'`,
        ),
      ),
      'the trail is genuinely filed under the plural',
    ).toBeGreaterThan(0)
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM audit_logs
            WHERE company_id = '${COMPANY_ID}' AND entity_type = 'EntityFieldValue'`,
        ),
      ),
      'and never under the singular',
    ).toBe(0)
  })
})

/** The human label `audit_entity_types` carries for each canonical type. */
function labelFor(singular) {
  return {
    EntityFieldValue: 'Custom Field Value',
    EntityFieldSet: 'Custom Field Set',
    OptionSet: 'Option Set',
  }[singular]
}
