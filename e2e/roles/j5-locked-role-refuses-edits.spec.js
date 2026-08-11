// ROLE-J5 — 🛡 The lock: a protected role refuses edits, from every writer.
//
// WHY THE LOCK IS ENFORCED WHERE IT IS, and why that is worth a browser test.
// The lock used to live in the REST controllers (roles.updateRole/deleteRole).
// Roles are ALSO writable over GraphQL, where `roles_upd` and `roles_del` carry
// no lock check at all — so the moment the Roles page moved to the syncEngine,
// the app-layer guard would have been bypassed by the app's own new write path.
// Migration 20260713140000 predicted that and moved the enforcement to a
// BEFORE UPDATE OR DELETE trigger, which every writer passes through: REST as
// superuser, GraphQL as app_user, and any future one.
//
// It was right, and this file is the proof that it is still right. RLS cannot
// express this rule — the lock is about WHICH COLUMNS changed, and a policy
// gates rows, not columns. (The mirror of the Users decision, where a column
// REVOKE could not survive rls.sql and the guard had to be a trigger.)
//
// THE INTERESTING HALF IS THE CONTROLS. A lock that refuses everything is not a
// control, it is a wall — the flag has to be removable by someone with authority
// or a locked role becomes permanent furniture. So this file asserts the refusal
// AND that unlock → edit → relock works, AND that the defeat is on the record.
//
// That last one used to be the finding: `locked` was absent from `trackFields`,
// so unlock → edit → relock read as an ordinary edit and the tamper control's
// own defeat was invisible. It is fixed — `locked` now leads the actionMap and
// resolves to LOCK/UNLOCK — and the assertion below is what keeps it fixed.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, ROLES, COMPANY_ID } from '../fixtures/cast.js'
import { graphql, expectMutationExists } from '../fixtures/sites.js'
import { sqlRow, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import { probeWrite, restoreRolesFixtures, writeSql } from '../fixtures/roles.js'

const PATCH_ROLE = `
  mutation PatchRole($input: UpdateRoleInput!) {
    updateRole(input: $input) { role { id name description locked } }
  }`

const LOCKED = ROLES.locked.id

/** Patch the locked role through the app's own write path. True = refused. */
async function refused(ctx, patch, id = LOCKED) {
  const { errors } = await graphql(ctx, PATCH_ROLE, { input: { id, patch } })
  return errors !== null && errors !== undefined
}

/**
 * The locked role as four separate COLUMNS, not one concatenated string.
 *
 * `sqlValue` returns `sqlRow(...)[0]`, and `sqlRow` splits psql's unaligned
 * output on '|'. Building the probe as `name || '|' || …` therefore collides
 * with the helper's own column separator: the whole tuple comes back as field
 * one and every later field reads `undefined` — which presents as "the fixture
 * is not locked" rather than as a broken helper.
 */
function roleRow(id = LOCKED) {
  const row = sqlRow(
    `SELECT name, coalesce(description,''), status_id, locked FROM roles WHERE id = '${id}'`,
  )
  if (!row) return { name: null, description: null, statusId: null, locked: null }
  return { name: row[0], description: row[1], statusId: row[2], locked: row[3] === 't' }
}

test.describe('ROLE-J5 · a locked role refuses edits', () => {
  test.beforeEach(() => restoreRolesFixtures())
  test.afterAll(() => restoreRolesFixtures())

  test.use({ storageState: AUTH.roleAdmin })

  test('PRECONDITION · the guard is a trigger, and the fixture is locked', async ({ browser }) => {
    // Assert WHAT is protecting the table. If someone later removes the trigger
    // believing the RLS policies cover it, this goes red for the right reason —
    // and the two policies below are named so the failure says which belief was
    // wrong. (The same shape as USER-J1's field-guard precondition.)
    expect(
      sqlValue(`SELECT count(*) FROM pg_trigger
                 WHERE tgrelid = 'roles'::regclass AND tgname = 'roles_lock_guard'`),
      'the lock guard trigger is installed',
    ).toBe('1')

    for (const policy of ['roles_upd', 'roles_del']) {
      expect(
        sqlValue(`SELECT coalesce(qual,'') FROM pg_policies
                   WHERE tablename = 'roles' AND policyname = '${policy}'`),
        `${policy} still carries NO lock check — the trigger is the only enforcement`,
      ).not.toContain('locked')
    }

    expect(roleRow().locked, 'the fixture role is locked at rest').toBe(true)

    const ctx = await browser.newContext({ storageState: AUTH.roleAdmin })
    await expectMutationExists(ctx, 'updateRole')
    await ctx.close()
  })

  test('🛡 a locked role refuses business edits over the app\'s write path', async ({ browser }) => {
    // Every field the trigger names, one at a time. Each value must DIFFER from
    // what the row already holds — the guard compares with IS DISTINCT FROM, so
    // a patch setting a column to its current value is a no-op the trigger
    // correctly allows, and asserting against one proves nothing.
    const ctx = await browser.newContext({ storageState: AUTH.roleAdmin })
    try {
      expect(await refused(ctx, { name: 'ROLE-J5 Renamed' }), 'name').toBe(true)
      expect(await refused(ctx, { description: 'ROLE-J5 rewritten' }), 'description').toBe(true)
      expect(await refused(ctx, { statusId: 'INACTIVE' }), 'statusId').toBe(true)
      expect(
        await refused(ctx, { deletedAt: new Date().toISOString() }),
        'soft delete is an edit too — otherwise the lock is bypassable by removal',
      ).toBe(true)

      const row = roleRow()
      expect(row.name, 'and the row is untouched').toBe('E2E Locked Role')
      expect(row.statusId).toBe('ACTIVE')
      expect(row.locked).toBe(true)
    } finally {
      await ctx.close()
    }
  })

  test('🛡 a locked role cannot be hard-deleted, by anyone', async () => {
    // Probed at the database because the SPA has no hard-delete path — and that
    // is exactly why it is worth probing. The trigger is BEFORE DELETE, so it
    // fires for a writer the UI does not have.
    // `alsoRefusedBy` is required here: probeWrite treats only authorization
    // errors as refusals by default, and the lock raises check_violation. Naming
    // it keeps the probe honest — a DELETE blocked by, say, a foreign key would
    // still be reported as a broken probe rather than as a working lock.
    const res = probeWrite(
      `DELETE FROM roles WHERE id = '${LOCKED}';`,
      { id: USERS.roleAdmin.id, companyId: COMPANY_ID },
      { alsoRefusedBy: /Role is locked/i },
    )
    expect(res.permitted, 'delete of a locked role must be refused').toBe(false)
    expect(res.error, 'and refused by the LOCK, not by RLS').toMatch(/locked/i)
    expect(
      sqlValue(`SELECT count(*) FROM roles WHERE id = '${LOCKED}'`),
      'the role survives',
    ).toBe('1')
  })

  test('🛡 the lock binds the superuser path too — it is a trigger, not a policy', () => {
    // The assertion that distinguishes a trigger from RLS. REST/Sequelize
    // connects as a Postgres SUPERUSER, which bypasses every policy in the
    // schema; if the lock lived in a policy it would be invisible here. A raw
    // superuser UPDATE is the strongest writer this database has.
    let refusedBySuperuser = false
    try {
      writeSql(`UPDATE roles SET name = 'ROLE-J5 Superuser Rename' WHERE id = '${LOCKED}'`)
    } catch (err) {
      refusedBySuperuser = /locked/i.test(String(err.stderr ?? err.message ?? ''))
    }
    expect(refusedBySuperuser, 'even the superuser is refused').toBe(true)
    expect(roleRow().name).toBe('E2E Locked Role')
  })

  test('DOM · the role detail page disables editing and offers Unlock', async ({ page }) => {
    // The affordance side. `canEdit = canUpdateRole && !isLocked`, so a locked
    // role must present as read-only EVEN TO someone who holds rpm:update —
    // otherwise the user meets the trigger as a raw error toast instead of an
    // explained state.
    await page.goto(`/roles/${LOCKED}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('E2E Locked Role').first()).toBeVisible({ timeout: 20_000 })

    await expect(
      page.getByRole('button', { name: 'Unlock' }),
      'the lock is presented as removable, not as a dead end',
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Lock', exact: true }),
      'and the Lock action is not offered on an already-locked role',
    ).toHaveCount(0)

    // The permission matrix is the module's real payload; it must be read-only.
    // `canUpdate=false` removes the bulk controls entirely, which is the
    // cheapest reliable signal that the whole surface went read-only.
    await expect(
      page.getByRole('button', { name: 'Make Admin' }),
      'matrix bulk controls are withdrawn while the role is locked',
    ).toHaveCount(0)
  })

  test('CONTROL · unlock → edit → relock works, and each step is on the record', async ({
    browser,
  }) => {
    // THE control. A lock nobody can remove is a bug, not a safeguard. This also
    // pins the fix for doc 20 item 3: the tamper control's own defeat used to be
    // invisible because `locked` was absent from trackFields, so this sequence
    // read as one ordinary edit.
    // A watermark, because `audit_logs` is append-only and every previous run of
    // this file left LOCK/UNLOCK rows behind. Counting all rows ever would make
    // these assertions pass on history — green forever after the first run, even
    // if auditing stopped completely. Every audit query below is scoped to rows
    // written after this instant.
    const since = sqlValue('SELECT now()')

    const ctx = await browser.newContext({ storageState: AUTH.roleAdmin })
    try {
      // 1. unlock — always allowed on a locked role, by design.
      expect(await refused(ctx, { locked: false }), 'unlock').toBe(false)
      expect(roleRow().locked).toBe(false)

      // 2. edit — the write that was refused three tests ago now succeeds. Same
      // actor, same mutation, same field: only the lock changed.
      expect(await refused(ctx, { description: 'ROLE-J5 edited while unlocked' }), 'edit').toBe(
        false,
      )
      expect(roleRow().description).toBe('ROLE-J5 edited while unlocked')

      // 3. relock.
      expect(await refused(ctx, { locked: true }), 'relock').toBe(false)
      expect(roleRow().locked).toBe(true)

      // 4. and the whole sequence is legible in the audit trail. Polled, not
      // read once: audit rows are written by the worker after the row that
      // triggered them, so an immediate read races the job.
      const auditedSince = (clause) =>
        `SELECT count(*) FROM audit_logs
          WHERE entity_type = 'Roles' AND entity_id = '${LOCKED}'
            AND created_at > '${since}' AND ${clause}`

      await waitForSqlValue(auditedSince("action = 'UNLOCK'"), {
        label: 'an UNLOCK audit row from THIS run',
        timeoutMs: 30_000,
      })
      await waitForSqlValue(auditedSince("action = 'LOCK'"), {
        label: 'a LOCK audit row from THIS run',
        timeoutMs: 30_000,
      })
      // The edit itself is distinguishable from the lock toggles — three events,
      // not one. Without this, "unlock, quietly change, relock" would still
      // reduce to a single indistinguishable UPDATE, which is exactly the shape
      // doc 20 item 3 described before `locked` entered trackFields.
      await waitForSqlValue(auditedSince("action NOT IN ('LOCK','UNLOCK')"), {
        label: 'the edit made between the toggles',
        timeoutMs: 30_000,
      })
      expect(
        sqlValue(`SELECT performed_by FROM audit_logs
                   WHERE entity_type = 'Roles' AND entity_id = '${LOCKED}'
                     AND action = 'UNLOCK' AND created_at > '${since}'
                   ORDER BY created_at DESC LIMIT 1`),
        'and the unlock names who did it',
      ).toBe(USERS.roleAdmin.id)
    } finally {
      await ctx.close()
      restoreRolesFixtures()
    }
  })

  test('CONTROL · an UNLOCKED role accepts the very same edit', async ({ browser }) => {
    // Proves the refusals above are the LOCK and not a broken write path — the
    // failure mode where a suite of denials passes because nothing works at all.
    // Uses a different role so the locked fixture stays locked.
    const ctx = await browser.newContext({ storageState: AUTH.roleAdmin })
    const target = ROLES.prize.id
    try {
      expect(
        sqlValue(`SELECT locked FROM roles WHERE id = '${target}'`),
        'the control role is not locked',
      ).toBe('f')
      expect(
        await refused(ctx, { description: 'ROLE-J5 control edit' }, target),
        'an unlocked role takes the identical patch',
      ).toBe(false)
      expect(roleRow(target).description).toBe('ROLE-J5 control edit')
    } finally {
      await ctx.close()
      writeSql(
        `UPDATE roles SET description = 'Carries sites:delete. Assigned to nobody, on purpose.'
          WHERE id = '${target}'`,
      )
    }
  })
})
