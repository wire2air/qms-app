// CF-8 — `option_sets:delete` now means something, and it costs somebody
// something.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FINDING THIS PINS
//
// L-1, which the module's own journey spec calls "THE headline regression"
// (PW-J7). The same Delete button was gated on two different permissions
// depending on which page you reached it from:
//
//   OptionSetsTab.vue:19 / OptionSetsHome.vue:9   ->  option_sets:delete
//   OptionSetsPageId.vue:25                       ->  option_sets:update
//
// What the pack did not say, and what makes it more than a UI inconsistency, is
// that THE DATABASE AGREED WITH THE WEAKER OF THE TWO. `option_sets` is
// paranoid, so both delete paths are an UPDATE setting `deleted_at`; `rls.sql`
// grants `app_user` no DELETE privilege on the table and defines no delete
// policy; so `option_set_update_rls` — which asks only for `option_sets:update`
// — was the sole gate. `option_sets:delete` was DECORATIVE on the authoritative
// GraphQL path. It hid two buttons and enforced nothing.
//
// That is not academic. On `app-db` the seeded **Quality Manager** role holds
// `option_sets` create/read/update and NOT delete — a deliberate policy
// statement that Quality Managers may author and edit picklists but not destroy
// them. The list page honoured it, the detail page handed them the button
// anyway, and the database let it through.
//
// The fix: the frontend detail page now gates on `delete`, and migration
// `20260902301000` adds `enforce_option_set_delete_permission()` — a
// **SECURITY INVOKER** `BEFORE UPDATE` trigger raising `QMSOS` when an untrusted
// caller sets `deleted_at` without `option_sets:delete`. A trigger rather than a
// policy because permissive RLS policies OR together and can only widen, and
// because a trigger also covers the REST/superuser path.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠ THIS FILE PINS A BEHAVIOUR CHANGE THAT COSTS A REAL ROLE A REAL ABILITY
//
// Any role holding `option_sets:update` but not `option_sets:delete` LOSES the
// ability to delete an option set. On `app-db` that is exactly `Quality
// Manager`. The stricter reading was taken on a 3-to-1 vote — the authz catalog
// registers `option_sets.delete`, the REST route enforces it, and the seeded
// role deliberately withholds it — but if product intended Quality Managers to
// be able to delete, the remedy is one grant, not reverting the trigger.
//
// `optionEditor` in `fixtures/customFields.js` is a deliberate replica of that
// role, and the middle test below is the test that will fail the day somebody
// decides differently. That is the point of it.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY EVERY PROBE IS TWO-SIDED, AND WHY THERE ARE THREE TIERS AND NOT TWO
//
// A guard trigger that raises is only evidence if the statement would otherwise
// have REACHED the row — and on this table RLS silently filters, so a persona
// without `option_sets:update` writes zero rows and raises nothing. Their zero
// is indistinguishable from a passing guard and would have passed against the
// defect. So three tiers, one grant apart each:
//
//   noAccess         no option_sets grant   rename 0 rows   soft-delete 0 rows  (SILENT — RLS)
//   optionEditor     +read/create/update    rename 1 row    soft-delete RAISES QMSOS
//   optionDestroyer  +delete                rename 1 row    soft-delete 1 row
//
// The middle tier is the one that carries the finding: `optionEditor` reaches
// the row (the rename proves it in the same test), so the refusal is the trigger
// and not invisibility.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS MEASURED TO JUSTIFY THE ASSERTIONS (app-db, 2026-09-01)
//
//   persona          rename        soft-delete
//   optionEditor     UPDATE 1      ERROR: Deleting an option set requires the
//                                  option_sets:delete permission.  (QMSOS)
//   optionDestroyer  UPDATE 1      UPDATE 1
//   noAccess         UPDATE 0      UPDATE 0
//
// and `SELECT prosecdef FROM pg_proc WHERE proname =
// 'enforce_option_set_delete_permission'` -> `false`.
//
// That last one is not a detail. A SECURITY DEFINER trigger reports the function
// OWNER in `current_user`, so its "is this an untrusted caller" test is false for
// everyone and the guard is permanently inert while looking perfectly healthy —
// which is how a Quality Events lifecycle guard sat dead for eight days.
//
// The table's grant set is asserted for the same reason: `app_user` holds
// INSERT/SELECT/UPDATE and NOT DELETE, which is WHY the destruction path is an
// UPDATE and WHY a trigger on UPDATE is the right place for this gate. If a
// future migration grants DELETE, this trigger stops covering the whole story.
import { test, expect } from '@playwright/test'
import { COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlValue, sqlAsAppUser } from '../fixtures/db.js'
import {
  CF_USERS,
  affectedRows,
  errorLine,
  hasPermission,
  installCustomFieldPersonas,
  optionsOf,
  removeOptionSet,
  seedOptionSet,
} from '../fixtures/customFields.js'

const sets = []

function probeSet(tag) {
  const id = seedOptionSet({ name: `CF-8 ${tag} ${Date.now()}`, options: ['Rework', 'Scrap'] })
  sets.push(id)
  return id
}

const rename = (userId, id) =>
  sqlAsAppUser(`UPDATE option_sets SET name = name || ' (renamed)' WHERE id = '${id}';`, {
    userId,
    companyId: COMPANY_ID,
  })

const softDelete = (userId, id) =>
  sqlAsAppUser(`UPDATE option_sets SET deleted_at = now() WHERE id = '${id}';`, {
    userId,
    companyId: COMPANY_ID,
  })

const isDeleted = (id) =>
  sqlValue(`SELECT (deleted_at IS NOT NULL)::text FROM option_sets WHERE id = '${id}'`) === 'true'

test.beforeAll(() => installCustomFieldPersonas())
test.afterAll(() => {
  for (const id of sets) removeOptionSet(id)
})

test.describe('CF-8 — deleting an option set requires option_sets:delete', () => {
  test('the guard is SECURITY INVOKER, and the table has no DELETE to grant', () => {
    // Both of these are preconditions for everything below being meaningful, and
    // both have a failure mode that looks like health.
    expect(
      sqlValue(
        `SELECT prosecdef::text FROM pg_proc WHERE proname = 'enforce_option_set_delete_permission'`,
      ),
      'a SECURITY DEFINER trigger would report the function owner in current_user and be permanently inert',
    ).toBe('false')

    const privileges = sql(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'app_user' AND table_name = 'option_sets' ORDER BY 1`,
    )
      .split('\n')
      .filter(Boolean)
    expect(
      privileges.sort(),
      'app_user may INSERT/SELECT/UPDATE and NOT DELETE — which is why destruction is an UPDATE',
    ).toEqual(['INSERT', 'SELECT', 'UPDATE'])

    expect(
      sqlValue(
        `SELECT count(*) FROM pg_trigger
          WHERE tgrelid = 'option_sets'::regclass AND NOT tgisinternal
            AND tgname = 'enforce_option_set_delete_permission_trg'`,
      ),
      'and the trigger is actually attached',
    ).toBe('1')
  })

  test('the three tiers are one grant apart, as this file claims', () => {
    for (const [persona, id] of [
      ['noAccess', USERS.noAccess.id],
      ['optionEditor', CF_USERS.optionEditor.id],
      ['optionDestroyer', CF_USERS.optionDestroyer.id],
    ]) {
      const expected = {
        noAccess: { update: false, delete: false },
        optionEditor: { update: true, delete: false },
        optionDestroyer: { update: true, delete: true },
      }[persona]
      expect(hasPermission(id, 'option_sets', 'update'), `${persona} option_sets:update`).toBe(
        expected.update,
      )
      expect(hasPermission(id, 'option_sets', 'delete'), `${persona} option_sets:delete`).toBe(
        expected.delete,
      )
    }
  })

  test('update WITHOUT delete: edits land, destruction raises QMSOS', () => {
    // ⚠ This is the behaviour change. `optionEditor` replicates the seeded
    // Quality Manager role, which holds option_sets create/read/update and not
    // delete. Before migration 20260902301000 the soft delete below SUCCEEDED.
    const id = probeSet('editor')

    // The reach, first — without it the refusal that follows is just RLS
    // filtering and would have passed against the defect.
    expect(
      affectedRows(rename(CF_USERS.optionEditor.id, id)),
      'option_sets:update reaches the row and edits it',
    ).toBe(1)

    const res = softDelete(CF_USERS.optionEditor.id, id)
    expect(res.ok, 'and the very same row cannot be soft-deleted by them').toBeFalsy()
    expect(errorLine(res)).toMatch(/requires the option_sets:delete permission/i)
    expect(isDeleted(id), 'the option set is still there').toBe(false)

    // The guard is specific to `deleted_at`, not a blanket immutability: a
    // second ordinary edit still works after the refusal, so the trigger has not
    // simply frozen the row.
    expect(
      affectedRows(
        sqlAsAppUser(
          `UPDATE option_sets SET description = 'still editable' WHERE id = '${id}';`,
          { userId: CF_USERS.optionEditor.id, companyId: COMPANY_ID },
        ),
      ),
      'editing the set still only needs option_sets:update',
    ).toBe(1)
  })

  test('update WITH delete: the identical statement succeeds', () => {
    // The pair. One grant apart from the test above, same statement, same table.
    const id = probeSet('destroyer')
    expect(affectedRows(rename(CF_USERS.optionDestroyer.id, id)), 'they can edit').toBe(1)
    expect(
      affectedRows(softDelete(CF_USERS.optionDestroyer.id, id)),
      'and option_sets:delete lets the soft delete through',
    ).toBe(1)
    expect(isDeleted(id), 'the set is soft-deleted').toBe(true)
  })

  test('no grant at all: silently zero rows, which is NOT the same as the guard firing', () => {
    // The bottom tier, and the reason the middle one exists. `noAccess` is
    // filtered out by `option_set_select_rls` before the UPDATE policy — let
    // alone the trigger — is consulted, so nothing raises and nothing changes.
    // A test that probed only this tier would have reported the guard as working
    // on the day it did not exist.
    const id = probeSet('noaccess')
    const renamed = rename(USERS.noAccess.id, id)
    expect(renamed.ok, 'nothing raised').toBeTruthy()
    expect(affectedRows(renamed), 'and nothing changed — RLS, silently').toBe(0)

    const deleted = softDelete(USERS.noAccess.id, id)
    expect(deleted.ok, 'the soft delete also raises nothing…').toBeTruthy()
    expect(affectedRows(deleted), '…and also touches nothing').toBe(0)
    expect(isDeleted(id)).toBe(false)
    expect(optionsOf(id), 'the set is exactly as seeded').toEqual(['Rework', 'Scrap'])
  })

  test('the superuser/REST path is covered too — the reason it is a trigger', () => {
    // A permissive RLS policy can only ever widen access, and would not have
    // covered the REST controller (`routes/optionSets.js`), which connects as
    // the superuser and bypasses RLS unless REST_RLS_ENABLED=true. A BEFORE
    // UPDATE trigger covers both paths from one place.
    //
    // The superuser IS a trusted caller by design, so the expected outcome here
    // is that the delete SUCCEEDS — the trigger distinguishes callers rather
    // than blanket-refusing, and pinning the permissive half is what stops a
    // future tightening from silently breaking the REST route and the seeder.
    const id = probeSet('superuser')
    sql(`UPDATE option_sets SET deleted_at = now() WHERE id = '${id}'`)
    expect(
      isDeleted(id),
      'a trusted (superuser) caller is not blocked — the guard gates the untrusted path',
    ).toBe(true)
  })
})
