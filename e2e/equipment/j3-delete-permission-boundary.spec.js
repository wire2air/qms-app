// EQ-J3 — the delete boundary, asked of all three write paths.
//
// WHY THIS FILE EXISTS. E1 was a live REST privilege escalation, closed on
// 2026-09-07. `DELETE /v1/services/equipment/:id` was mounted with
// `enforcePermission('calibration_equipment', 'update')`, while every other
// layer demanded `delete`:
//
//   * `equipment_del` (database/rls.sql) — has_permission(…, 'delete')
//   * the soft-delete guard trigger (migration 20260907150000) — the same
//   * `EquipmentHome.vue` — hides the button behind `calibration_equipment:delete`
//
// and the guard trigger SELF-SKIPS on the superuser connection REST runs on
// (`IF current_user <> 'app_user' THEN RETURN NEW`), by design: "the REST route
// has already checked delete." So on that path the route WAS the check, and it
// was asking the wrong question. A role holding update-and-not-delete could
// tombstone the instrument register while the UI told it that it could not.
//
// The module has three write paths and they are governed in three different
// places, so a refusal on one says nothing about the others. That is why this
// file probes each:
//
//   1. THE BUTTON  — `EquipmentHome.vue` v-if="canDelete". UX only; proves
//      nothing on its own, which is exactly why it is asserted ALONGSIDE the
//      other two rather than instead of them.
//   2. REST        — the route's enforcePermission. E1 itself.
//   3. THE SYNCENGINE — `BaseModel.delete()` on a paranoid model sets
//      deleted_at and issues an **UPDATE**, so `equipment_del` never runs and
//      only the guard trigger stands between an `update` holder and a
//      tombstone. This is F-27, and it is the path the register's own trash
//      icon uses.
//
// Both sides of every probe. `technician` (E2E QC Inspector) holds
// calibration_equipment:update and NOT delete; `admin` (E2E QC Author) holds
// both. A guard that had quietly stopped matching anything would refuse both
// personas and still look like a perfect gate against the denial half alone.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, EQUIPMENT, SITES, USERS } from '../fixtures/cast.js'
import { sql, sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import {
  createPersonaPool,
  errorMessage,
  findEquipment,
  findEquipmentByCode,
  openRegister,
  purgeEquipmentByCode,
  restDelete,
  restPatch,
  restPost,
  uniqueCode,
} from '../fixtures/equipment.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const lastLine = (out) => out.trim().split('\n').pop().trim()

// A throwaway instrument, minted over REST by whichever persona a test needs.
// Deletes that are SUPPOSED to succeed are aimed at one of these; the seeded
// `undeletable` row is only ever the target of a delete that must fail.
async function mintInstrument(page, code) {
  purgeEquipmentByCode(code)
  const res = await restPost(page, '/equipment', {
    code,
    name: `Throwaway ${code}`,
    category: 'INSTRUMENT',
    siteId: SITES.primary.id,
    departmentId: null,
  })
  expect(res.status(), `mint ${code} failed: ${await res.text()}`).toBe(201)
  const row = findEquipmentByCode(code)
  expect(row, 'the minted row is in Postgres').not.toBeNull()
  return row
}

test.describe('EQ-J3 · update does not confer delete', () => {
  test('the register offers the technician no delete control, but does let them edit', async ({
    browser,
  }) => {
    const page = await pool.page(browser, EQUIPMENT.technician.auth)
    await openRegister(page)

    // The trash icon is `aria-label="Delete equipment"`, rendered per row behind
    // v-if="canDelete". Zero of them for a persona holding only update.
    await expect(
      page.getByRole('button', { name: 'Delete equipment' }),
      'no row offers a delete control to an update-only persona',
    ).toHaveCount(0)

    // THE CONTROL THAT MAKES THE ABOVE MEAN SOMETHING. "No delete button" is
    // also what a persona with no permissions at all sees, and what a broken
    // page renders. `Record calibration` is gated on canUpdate && the row being
    // calibration-tracked, so its presence proves this session really does hold
    // update — the whole premise of the escalation.
    await expect(
      page.getByRole('button', { name: /Record calibration/ }).first(),
      'the same persona IS offered the update-gated quick action',
    ).toBeVisible()
  })

  test('REST refuses the technician’s DELETE by name, and the row survives (E1)', async ({
    browser,
  }) => {
    const page = await pool.page(browser, EQUIPMENT.technician.auth)
    const target = EQUIPMENT.undeletable

    // Premise, asserted rather than assumed: this session can WRITE to the row.
    // Without it, a 403 on DELETE could just mean the session was broken.
    const patched = await restPatch(page, `/equipment/${target.id}`, {
      notes: `EQ-J3 touched at ${new Date().toISOString()}`,
    })
    expect(patched.status(), 'the technician holds update on this very row').toBe(200)

    const res = await restDelete(page, `/equipment/${target.id}`)
    expect(res.status(), 'DELETE is gated on calibration_equipment:delete').toBe(403)
    expect(await errorMessage(res)).toMatch(/not permitted to delete on calibration_equipment/i)

    expect(
      findEquipment(target.id).deletedAt,
      'the refused DELETE wrote no tombstone',
    ).toBeNull()
  })

  test('the syncEngine’s paranoid UPDATE is refused too (F-27)', async ({ browser }) => {
    // `BaseModel.delete()` sets deleted_at and then marks the operation UPDATE,
    // so the wire mutation is `UPDATE equipment SET deleted_at = now()` and
    // `equipment_del` is never evaluated. That is the path the register's own
    // trash icon takes, and before migration 20260907150000 an `update` holder
    // walked straight through it. `sqlAsAppUser` reproduces exactly what
    // PostGraphile issues: SET ROLE app_user with the session GUCs.
    const target = EQUIPMENT.undeletable
    const denied = sqlAsAppUser(
      `UPDATE equipment SET deleted_at = NOW() WHERE id = '${target.id}';`,
      { userId: EQUIPMENT.technician.user.id, companyId: COMPANY_ID },
    )
    expect(denied.ok, 'the guard trigger RAISED rather than silently no-opping').toBe(false)
    expect(denied.error).toMatch(/Deleting this record requires one of: calibration_equipment:delete/i)

    expect(findEquipment(target.id).deletedAt, 'still no tombstone').toBeNull()

    // A plain edit on the same row through the same path still works — so the
    // trigger is gating the soft-DELETE transition specifically and has not
    // simply locked the table for this persona.
    const edit = sqlAsAppUser(
      `UPDATE equipment SET location_text = 'EQ-J3 app_user edit' WHERE id = '${target.id}';`,
      { userId: EQUIPMENT.technician.user.id, companyId: COMPANY_ID },
    )
    expect(edit.ok, 'update is untouched — only the tombstone transition is guarded').toBe(true)
    expect(lastLine(edit.output), 'and it really did reach the row').toBe('UPDATE 1')
  })

  test('the register DOES offer delete to a delete-holder, and both paths work', async ({
    browser,
  }) => {
    // The positive half. Without it every assertion above is satisfied by a
    // policy that matches nobody.
    const page = await pool.page(browser, EQUIPMENT.admin.auth)

    const restCode = uniqueCode('J3REST')
    const syncCode = uniqueCode('J3SYNC')
    const restRow = await mintInstrument(page, restCode)
    const syncRow = await mintInstrument(page, syncCode)

    // 1. The button is rendered for this persona.
    await openRegister(page)
    await expect(
      page.getByRole('button', { name: 'Delete equipment' }).first(),
      'a delete-holder is offered the control the technician was not',
    ).toBeVisible()

    // 2. REST honours the same verb it refused above.
    const res = await restDelete(page, `/equipment/${restRow.id}`)
    expect(res.status(), `REST delete failed: ${await res.text()}`).toBe(200)
    expect(
      findEquipment(restRow.id).deletedAt,
      'REST soft-deletes (paranoid) rather than hard-deleting',
    ).not.toBeNull()

    // 3. And so does the syncEngine path, through the guard trigger.
    const allowed = sqlAsAppUser(
      `UPDATE equipment SET deleted_at = NOW() WHERE id = '${syncRow.id}';`,
      { userId: EQUIPMENT.admin.user.id, companyId: COMPANY_ID },
    )
    expect(allowed.ok, `guard trigger refused a delete-holder: ${allowed.error}`).toBe(true)
    expect(lastLine(allowed.output)).toBe('UPDATE 1')
    expect(findEquipment(syncRow.id).deletedAt, 'the tombstone landed').not.toBeNull()

    purgeEquipmentByCode(restCode)
    purgeEquipmentByCode(syncCode)
  })

  test('a member with no calibration_equipment grant can READ the register but not write it', async ({
    browser,
  }) => {
    // The module's deliberate asymmetry, pinned so nobody "fixes" it by
    // accident. `calibration_equipment` has NO `read` action in
    // authz.module_actions (migration 20260810170000 dropped it) and
    // `equipment_sel` is a bare company_id match, so the register is open to
    // the whole tenant — while every write policy is permission + scope gated.
    const page = await pool.page(browser, EQUIPMENT.reader.auth)

    const visible = sqlAsAppUser(
      `SELECT count(*) FROM equipment WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL;`,
      { userId: USERS.noAccess.id, companyId: COMPANY_ID },
    )
    expect(
      Number(lastLine(visible.output)),
      'a zero-grant member still sees the register — by design',
    ).toBeGreaterThanOrEqual(6)

    // …and cannot write a byte of it, on any path.
    const created = await restPost(page, '/equipment', {
      code: uniqueCode('J3DENY'),
      name: 'Should not land',
      siteId: SITES.primary.id,
    })
    expect(created.status()).toBe(403)
    expect(await errorMessage(created)).toMatch(/not permitted to create on calibration_equipment/i)

    const patched = await restPatch(page, `/equipment/${EQUIPMENT.undeletable.id}`, {
      name: 'Should not land either',
    })
    expect(patched.status()).toBe(403)

    const removed = await restDelete(page, `/equipment/${EQUIPMENT.undeletable.id}`)
    expect(removed.status()).toBe(403)

    const rlsWrite = sqlAsAppUser(
      `UPDATE equipment SET name = 'Should not land at all' WHERE id = '${EQUIPMENT.undeletable.id}';`,
      { userId: USERS.noAccess.id, companyId: COMPANY_ID },
    )
    // An UPDATE that RLS filtered out RAISES NOTHING — it succeeds against zero
    // rows. Reading `ok` alone would score a silent no-op as a passing guard, so
    // the assertion is on the command tag.
    expect(lastLine(rlsWrite.output), 'equipment_upd matched no rows for this persona').toBe(
      'UPDATE 0',
    )

    const row = findEquipment(EQUIPMENT.undeletable.id)
    expect(row.name).toBe(EQUIPMENT.undeletable.name)
    expect(row.deletedAt).toBeNull()
  })

  test.afterAll(() => {
    // Leave the seeded probe row exactly as the seed made it — its notes and
    // location were written to by the tests above.
    sql(
      `UPDATE equipment
          SET notes = 'Seeded for EQ-J3. NEVER delete this row from a spec.',
              location_text = 'Lab 1, Cabinet',
              updated_at = NOW()
        WHERE id = '${EQUIPMENT.undeletable.id}'`,
    )
    expect(sqlValue(`SELECT deleted_at IS NULL FROM equipment WHERE id = '${EQUIPMENT.undeletable.id}'`)).toBe(
      't',
    )
  })
})
