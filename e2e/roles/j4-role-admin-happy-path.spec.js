// ROLE-J4 — 🟢 The main path: create a role, grant it, assign it, and have the
// grant actually take effect.
//
// THE POINT OF THIS FILE. Every other spec in this directory is a security
// probe, and a module covered only by refusals will happily stay green while
// completely broken — a database that refuses everybody satisfies J1, J2 and J3
// in full. This is the journey the module exists for, and until now it had no
// automated coverage of any kind at any layer, for the reason doc 20 names: the
// E2E tenant seeded eleven roles and not one of them could write to a role.
//
// It is worth doing as ONE journey rather than four tests because the value is
// in the chain. Each link is individually plausible and the product is only
// correct if the whole thing holds:
//
//   frontend   the Create Role dialog writes through the syncEngine (GraphQL)
//   frontend   the permission matrix saves through a REST action RPC
//              (PUT /v1/services/authz/roles/:id/permissions) — a DIFFERENT
//              write path from everything else in the module, gated twice
//   postgres   set_permission checks authorization INSIDE the SECURITY DEFINER
//   frontend   the Users dialog writes roles_on_users, again via the syncEngine
//   postgres   authz.has_permission resolves the new grant for the assignee
//
// THE LAST STEP IS THE ONE THAT MATTERS. "The matrix saved" and "the assignment
// row exists" are both satisfiable by a role that confers nothing. The journey
// ends by asking the database whether the assigned user's EFFECTIVE AUTHORITY
// moved — the same question ROLE-J2 and ROLE-J3 ask about attackers, asked here
// about somebody who is supposed to gain it.
//
// The subject is created and destroyed by this file and never reuses a seeded
// role, so a failure mid-run cannot leave the tenant with a stray grant.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, COMPANY_ID, PRIZE_CAPABILITY } from '../fixtures/cast.js'
import { sqlValue, waitForSqlValue } from '../fixtures/db.js'
import {
  uniqueRoleName,
  findRoleByName,
  purgeRoleByName,
  hasCapabilityInDb,
  assignmentCount,
  restoreRolesFixtures,
} from '../fixtures/roles.js'

// "Sites" is the module granted, and `sites:delete` the capability checked,
// deliberately matching the prize role the escalation journeys try to steal.
// The same capability being unreachable by theft and reachable by proper
// administration is what makes both halves meaningful.
const MODULE_NAME = 'Sites'
const LEVEL = 'Full control'
const SCOPE = 'Company-wide'

// The assignee holds NOTHING at rest, so any capability observed at the end
// arrived through this journey and could not have been there already.
const ASSIGNEE = USERS.noAccess

/**
 * Navigate, tolerating a redirect the SPA issues at the same moment.
 *
 * The create dialog routes on its own once the role lands, so a `goto` fired
 * from the test can be cancelled mid-flight ("interrupted by another navigation
 * to /roles"). It is a race between two legitimate navigations, not a product
 * fault, and it only appears when the whole suite runs — the failure mode that
 * makes a spec pass alone and fail in CI. Settle first, then retry once.
 */
async function gotoStable(page, url) {
  await page.waitForLoadState('networkidle').catch(() => {})
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
  } catch (err) {
    if (!/interrupted by another navigation/i.test(String(err))) throw err
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.goto(url, { waitUntil: 'domcontentloaded' })
  }
}

test.describe('ROLE-J4 · the role administrator happy path', () => {
  const roleName = uniqueRoleName('J4')

  // Purging this file's own role is not enough to make its setup self-sufficient.
  // Step 0 asserts the assignee (`noAccess`) starts with NO capability, and the
  // §30 fixture another spec hands them is exactly that capability: ROLE-J2's
  // CONTROL test grants the prize role — `sites:delete` — to this same user. It
  // cleans up in a `finally`, but a crash there leaves the premise false and this
  // file then fails on its first line for somebody else's reason.
  //
  // beforeAll rather than beforeEach, unlike the escalation specs: the second
  // test here runs against the role and the assignment the first one created, so
  // per-test restoration would be wrong in principle even though
  // `restoreRolesFixtures` happens not to touch a freshly-created role today.
  test.beforeAll(() => {
    restoreRolesFixtures()
    purgeRoleByName(roleName)
  })
  test.afterAll(() => purgeRoleByName(roleName))

  test.use({ storageState: AUTH.roleAdmin })

  test('create a role, grant it in the matrix, assign a user, and the grant takes effect', async ({
    page,
  }) => {
    // ── 0. the premise ────────────────────────────────────────────────────
    expect(
      hasCapabilityInDb({ id: ASSIGNEE.id, companyId: COMPANY_ID }, PRIZE_CAPABILITY.module, PRIZE_CAPABILITY.action),
      'the assignee starts with nothing — otherwise the final assertion proves nothing',
    ).toBe(false)

    // ── 1. create, through the real dialog ────────────────────────────────
    await page.goto('/roles', { waitUntil: 'domcontentloaded' })
    // The page action reads "Create New Role"; the dialog's submit reads
    // "Create Role". Distinct names, deliberately used as distinct anchors — a
    // loose /create/i match would resolve to both and hide which one was hit.
    const createButton = page.getByRole('button', { name: 'Create New Role' })
    await expect(createButton, 'roleAdmin is offered the create action').toBeVisible({
      timeout: 20_000,
    })
    await createButton.click()

    // By accessible name, not by placeholder: getByPlaceholder matches on a
    // SUBSTRING, and this dialog's two text fields ("e.g., Field Supervisor" and
    // "Describe the purpose…") are close enough that a loose match is a
    // strict-mode violation waiting to happen.
    const dialog = page.getByRole('textbox', { name: 'Role Name' })
    await dialog.fill(roleName)
    await page
      .getByRole('textbox', { name: 'Description' })
      .fill('Created by ROLE-J4 — the role administrator happy path.')
    await page.getByRole('button', { name: 'Create Role' }).last().click()

    // The row, as the database sees it. Polled, not read once: the dialog saves
    // through the syncEngine and the navigation that follows is not a promise
    // that the write landed.
    await waitForSqlValue(`SELECT count(*) FROM roles WHERE name = '${roleName}'`, {
      label: 'the new role row',
      timeoutMs: 20_000,
    })
    const role = findRoleByName(roleName)
    expect(role, 'the role was created').toBeTruthy()
    expect(
      sqlValue(`SELECT company_id FROM roles WHERE id = '${role.id}'`),
      'created into the acting tenant, never a client-supplied one',
    ).toBe(COMPANY_ID)
    expect(role.locked, 'a new role starts unlocked').toBe(false)
    expect(
      Number(sqlValue(`SELECT count(*) FROM authz.role_module_permissions WHERE role_id = '${role.id}'`)),
      'and starts with no grants at all — authority is opt-in',
    ).toBe(0)

    // ── 2. grant it, through the matrix ───────────────────────────────────
    await gotoStable(page, `/roles/${role.id}`)
    await expect(page.getByRole('textbox', { name: 'Search modules...' })).toBeVisible({
      timeout: 20_000,
    })
    // Narrow to one row first. The catalog is 64 modules across several
    // collapsible sections, so a bare row lookup is both slow and ambiguous
    // ("Sites" also appears inside other module names).
    await page.getByRole('textbox', { name: 'Search modules...' }).fill(MODULE_NAME)

    const row = page.getByRole('row').filter({ hasText: MODULE_NAME }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })

    // Two selects per row: Level, then Scope. Scope only renders once the level
    // is off "No access", so they must be set in that order.
    //
    // NOT `exact: true`. Each option renders its hint underneath the label
    // ("Full control" / "Every capability the module offers"), so the accessible
    // name is both lines and an exact match finds nothing — while the dropdown
    // is plainly open on screen. Substring matching is the right tool here and
    // is still unambiguous: no two levels or scopes share a prefix.
    await row.getByRole('combobox').first().click()
    await page.getByRole('option', { name: LEVEL }).click()
    await row.getByRole('combobox').nth(1).click()
    await page.getByRole('option', { name: SCOPE }).click()

    await page.getByRole('button', { name: 'Save Changes' }).first().click()

    // The matrix write is the module's best-defended path — a SECURITY DEFINER
    // with its own authorization check, behind a second route-level gate. Poll:
    // it is a REST round trip, not a syncEngine save.
    await waitForSqlValue(
      `SELECT count(*) FROM authz.role_module_permissions
        WHERE role_id = '${role.id}'
          AND module_id = '${PRIZE_CAPABILITY.module}'
          AND action_id = '${PRIZE_CAPABILITY.action}'`,
      { label: 'the sites:delete grant', timeoutMs: 25_000 },
    )
    expect(
      sqlValue(`SELECT scope_id FROM authz.role_module_permissions
                 WHERE role_id = '${role.id}'
                   AND module_id = '${PRIZE_CAPABILITY.module}'
                   AND action_id = '${PRIZE_CAPABILITY.action}'`),
      'at the scope the UI offered — a grant saved at the wrong reach is a silent downgrade',
    ).toBe('tenant')

    // THE IMPLICIT-READ INVARIANT, asserted as behaviour rather than as storage.
    //
    // "Full control at Company-wide" grants every capability at tenant scope and
    // stores NO explicit `sites:read` row — deliberately. `authz.has_permission`
    // matches any action on a module when asked for 'read', so a read row whose
    // reach equals the writes' would be redundant, and buildDesiredPermissions
    // omits it (it is stored only when read reaches WIDER than the writes).
    //
    // Asserting the row's existence would therefore fail against a correct
    // product — it did, when this was first written the other way round. What
    // must hold is that the holder can SEE what they can act on, which is
    // checked against the assignee in step 4.
    expect(
      Number(
        sqlValue(`SELECT count(*) FROM authz.role_module_permissions
                   WHERE role_id = '${role.id}'
                     AND module_id = '${PRIZE_CAPABILITY.module}' AND action_id = 'read'`),
      ),
      'no redundant read row is stored when read and write reach equally far',
    ).toBe(0)

    // ── 3. assign it, through the Users dialog ────────────────────────────
    // "Save Changes" returns to the list, so the detail page has to be
    // re-entered. Navigating rather than going back also proves the grant was
    // persisted and re-read from the server, not just held in component state.
    await gotoStable(page, `/roles/${role.id}`)

    // This is the app's ONLY correctly-gated role-assignment surface and the
    // one real users take.
    const openUsers = page.getByRole('button', { name: 'View All Users' })
    await expect(openUsers.first()).toBeVisible({ timeout: 20_000 })
    await openUsers.first().click()
    await expect(page.getByText('Assign Users to Role')).toBeVisible({ timeout: 10_000 })

    await page.getByRole('textbox').last().fill(ASSIGNEE.email)
    await page.getByText(ASSIGNEE.email).first().click()
    await page.getByRole('button', { name: 'Save Assignments' }).click()

    await waitForSqlValue(
      `SELECT count(*) FROM roles_on_users
        WHERE user_id = '${ASSIGNEE.id}' AND role_id = '${role.id}' AND deleted_at IS NULL`,
      { label: 'the role assignment row', timeoutMs: 20_000 },
    )
    expect(assignmentCount(ASSIGNEE.id, role.id)).toBe(1)

    // ── 4. the outcome ────────────────────────────────────────────────────
    // The assertion that makes the whole chain mean something. Every step above
    // could pass while the role confers nothing at all.
    expect(
      hasCapabilityInDb(
        { id: ASSIGNEE.id, companyId: COMPANY_ID },
        PRIZE_CAPABILITY.module,
        PRIZE_CAPABILITY.action,
      ),
      'the assignee now genuinely holds the capability the role carries',
    ).toBe(true)

    // The other half of the implicit-read invariant. No `sites:read` row exists
    // anywhere, yet the assignee can read sites — because a capability grant
    // implies read on its module. A holder who could delete records they cannot
    // see would be the failure this invariant prevents.
    expect(
      hasCapabilityInDb({ id: ASSIGNEE.id, companyId: COMPANY_ID }, PRIZE_CAPABILITY.module, 'read'),
      'read is conferred implicitly, without a stored read row',
    ).toBe(true)

    // And it is scoped, not merely present: `has_permission` answers the verb
    // question, `scope_allowed` answers the reach question, and a grant that
    // saved at the wrong scope passes the first and fails the second.
    expect(
      sqlValue(`SELECT array_to_string(
                  authz.effective_permission_strings('${ASSIGNEE.id}', '${COMPANY_ID}'), ' ')`),
      'and it shows up in the session strings the SPA gates on',
    ).toContain(`${PRIZE_CAPABILITY.module}:${PRIZE_CAPABILITY.action}`)
  })

  test('CONTROL · revoking the role removes the capability again', async ({ page }) => {
    // Authority that cannot be withdrawn is not administration. Runs against the
    // role the journey above left in place, through the same dialog — the
    // revoke path is a soft delete and is gated by the same permission as the
    // grant, which ROLE-J2 pins at the policy layer and this pins in the UI.
    const role = findRoleByName(roleName)
    expect(role, 'the J4 role still exists').toBeTruthy()
    expect(assignmentCount(ASSIGNEE.id, role.id), 'and is still assigned').toBe(1)

    await gotoStable(page, `/roles/${role.id}`)
    await page.getByRole('button', { name: 'View All Users' }).first().click()
    await expect(page.getByText('Assign Users to Role')).toBeVisible({ timeout: 10_000 })

    // Deselect the assignee, then save the (now empty) selection.
    await page.getByRole('textbox').last().fill(ASSIGNEE.email)
    await page.getByText(ASSIGNEE.email).first().click()
    await page.getByRole('button', { name: 'Save Assignments' }).click()

    await waitForSqlValue(
      `SELECT count(*) = 0 FROM roles_on_users
        WHERE user_id = '${ASSIGNEE.id}' AND role_id = '${role.id}' AND deleted_at IS NULL`,
      { label: 'the assignment is withdrawn', timeoutMs: 20_000 },
    )
    expect(
      hasCapabilityInDb(
        { id: ASSIGNEE.id, companyId: COMPANY_ID },
        PRIZE_CAPABILITY.module,
        PRIZE_CAPABILITY.action,
      ),
      'and the capability went with it — permissions are never snapshotted',
    ).toBe(false)
  })
})
