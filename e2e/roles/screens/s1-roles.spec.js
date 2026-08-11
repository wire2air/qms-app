// Roles screenshots · S1 — the administration workspace.
//   The list, the Create New Role dialog (blank → filled → the new row), the
//   role detail page with its permission matrix (search → Level options →
//   Scope options → configured → saved), and the "View All Users" assignment
//   dialog (open → searched → selected → saved → Currently Assigned).
//
// The whole journey is ROLE-J4's, driven with its selectors: the page action
// reads "Create New Role" and the dialog's submit reads "Create Role" (distinct
// names, deliberately used as distinct anchors); the matrix rows are narrowed
// with the "Search modules..." box before their two comboboxes are touched
// (Scope only renders once Level is off "No access", so the order is not
// optional); and the Level/Scope options are matched by SUBSTRING, because each
// option renders its hint underneath the label and an exact match finds nothing
// while the dropdown is plainly open on screen.
//
// The subject role is created and purged by this file and never reuses a seeded
// one, so a failure mid-run cannot leave the tenant with a stray grant.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, USERS, PRIZE_CAPABILITY } from '../../fixtures/cast.js'
import { waitForSqlValue } from '../../fixtures/db.js'
import {
  uniqueRoleName,
  findRoleByName,
  purgeRoleByName,
  restoreRolesFixtures,
} from '../../fixtures/roles.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('roles')

// Same module/level/scope as ROLE-J4 — "Sites / Full control / Company-wide"
// is the grant whose storage and effect that journey already pins.
const MODULE_NAME = 'Sites'
const LEVEL = 'Full control'
const SCOPE = 'Company-wide'

// Holds nothing at rest, so the assignment captures show a real change.
const ASSIGNEE = USERS.noAccess

/**
 * Navigate, tolerating a redirect the SPA issues at the same moment (ROLE-J4).
 * The create dialog routes on its own once the role lands, so a `goto` fired
 * from the test can be cancelled mid-flight. Settle first, then retry once.
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

/** The roles table's own search box (DataTable `searchable`). */
function tableSearch(page) {
  return page.getByPlaceholder('Search…', { exact: true }).first()
}

/** The assignment dialog's search box (RoleUsersDialog). */
function dialogSearch(page) {
  return page.getByPlaceholder('Search users by name or email...')
}

test.describe.serial('Roles screenshots · list, create, matrix, assignment', () => {
  const roleName = uniqueRoleName('Screens-S1')

  // Purging this file's own role is not enough to make its setup self-sufficient
  // — §30's fixtures are shared with the escalation journeys, which lend and
  // withdraw assignments (ROLE-J4 makes the same point).
  test.beforeAll(() => {
    restoreRolesFixtures()
    purgeRoleByName(roleName)
  })
  test.afterAll(() => purgeRoleByName(roleName))

  test('list and the Create New Role dialog', async ({ browser }) => {
    test.setTimeout(300_000)
    // roleAdmin holds role_permission_management CRUD — the only cast member
    // who can write to a role.
    const ctx = await browser.newContext({ storageState: AUTH.roleAdmin })
    const page = await ctx.newPage()

    await page.goto('/roles', { waitUntil: 'domcontentloaded' })
    const createButton = page.getByRole('button', { name: 'Create New Role' })
    await expect(createButton, 'roleAdmin is offered the create action').toBeVisible({
      timeout: 30_000,
    })
    await shot(page, 'list')

    // ── Create dialog, blank then filled ───────────────────────────────────
    await createButton.click()
    const nameField = page.getByRole('textbox', { name: 'Role Name' })
    await expect(nameField).toBeVisible({ timeout: 15_000 })
    await shot(page, 'create-dialog')

    await nameField.fill(roleName)
    await page
      .getByRole('textbox', { name: 'Description' })
      .fill('Created by the Roles screenshot run — the role administrator happy path.')
    await shot(page, 'create-dialog-filled')

    // ── Created ────────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Create Role' }).last().click()
    // Polled, not read once: the dialog saves through the syncEngine, and the
    // dialog closing is not a promise that the write landed.
    await waitForSqlValue(`SELECT count(*) FROM roles WHERE name = '${roleName}'`, {
      label: 'the new role row',
      timeoutMs: 25_000,
    })

    await tableSearch(page).fill(roleName)
    await expect(page.getByRole('cell', { name: roleName, exact: true }).first()).toBeVisible({
      timeout: 30_000,
    })
    await shot(page, 'list-after-create')

    await ctx.close()
  })

  test('detail, the permission matrix and the assignment dialog', async ({ browser }) => {
    test.setTimeout(600_000)
    const ctx = await browser.newContext({ storageState: AUTH.roleAdmin })
    const page = await ctx.newPage()

    const role = findRoleByName(roleName)
    expect(role, 'the role created above still exists').toBeTruthy()

    // ── The detail page ────────────────────────────────────────────────────
    await gotoStable(page, `/roles/${role.id}`)
    const moduleSearch = page.getByRole('textbox', { name: 'Search modules...' })
    await expect(moduleSearch).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'View All Users' }).first()).toBeVisible()
    await shot(page, 'detail')

    // ── The matrix, narrowed to one module ─────────────────────────────────
    // The catalog is 64 modules across several collapsible sections, so a bare
    // row lookup is both slow and ambiguous.
    await moduleSearch.fill(MODULE_NAME)
    const row = page.getByRole('row').filter({ hasText: MODULE_NAME }).first()
    await expect(row).toBeVisible({ timeout: 20_000 })
    await shot(page, 'detail-matrix-search')

    // Level first — Scope only renders once the level is off "No access".
    await row.getByRole('combobox').first().click()
    const levelOption = page.getByRole('option', { name: LEVEL })
    await expect(levelOption).toBeVisible({ timeout: 15_000 })
    await shot(page, 'detail-matrix-level-options')
    await levelOption.click()

    await row.getByRole('combobox').nth(1).click()
    const scopeOption = page.getByRole('option', { name: SCOPE })
    await expect(scopeOption).toBeVisible({ timeout: 15_000 })
    await shot(page, 'detail-matrix-scope-options')
    await scopeOption.click()

    // The unsaved-changes chip is the matrix's own signal that the edit is held
    // but not yet persisted — the state the Save action resolves.
    await expect(page.getByText(/\d+ unsaved/)).toBeVisible({ timeout: 15_000 })
    await shot(page, 'detail-matrix-configured')

    // ── Saved ──────────────────────────────────────────────────────────────
    // The matrix writes through a REST action RPC (a SECURITY DEFINER with its
    // own authorization check), not the syncEngine — poll for the grant row.
    await page.getByRole('button', { name: 'Save Changes' }).first().click()
    await waitForSqlValue(
      `SELECT count(*) FROM authz.role_module_permissions
        WHERE role_id = '${role.id}'
          AND module_id = '${PRIZE_CAPABILITY.module}'
          AND action_id = '${PRIZE_CAPABILITY.action}'`,
      { label: 'the sites:delete grant', timeoutMs: 30_000 },
    )

    // Save returns to the list, so the detail page has to be re-entered —
    // which also proves the grant was persisted and re-read from the server.
    await gotoStable(page, `/roles/${role.id}`)
    await expect(page.getByRole('textbox', { name: 'Search modules...' })).toBeVisible({
      timeout: 30_000,
    })
    await page.getByRole('textbox', { name: 'Search modules...' }).fill(MODULE_NAME)
    await expect(page.getByRole('row').filter({ hasText: MODULE_NAME }).first()).toBeVisible({
      timeout: 20_000,
    })
    await shot(page, 'detail-matrix-saved')

    // ── The assignment dialog ──────────────────────────────────────────────
    // The app's only correctly-gated role-assignment surface, and the one real
    // users take (ROLE-J1).
    const openUsers = page.getByRole('button', { name: 'View All Users' }).first()
    await openUsers.click()
    await expect(page.getByText('Assign Users to Role')).toBeVisible({ timeout: 20_000 })
    await shot(page, 'users-dialog')

    await dialogSearch(page).fill(ASSIGNEE.email)
    await expect(page.getByText(ASSIGNEE.email).first()).toBeVisible({ timeout: 15_000 })
    await shot(page, 'users-dialog-search')

    await page.getByText(ASSIGNEE.email).first().click()
    await expect(page.getByText('1 user selected')).toBeVisible({ timeout: 15_000 })
    await shot(page, 'users-dialog-selected')

    await page.getByRole('button', { name: 'Save Assignments' }).click()
    await waitForSqlValue(
      `SELECT count(*) FROM roles_on_users
        WHERE user_id = '${ASSIGNEE.id}' AND role_id = '${role.id}' AND deleted_at IS NULL`,
      { label: 'the role assignment row', timeoutMs: 25_000 },
    )
    await expect(page.getByText('Assign Users to Role')).toHaveCount(0, { timeout: 20_000 })
    await shot(page, 'detail-after-assignment')

    // Reopened: the assignee now carries the dialog's "Currently Assigned"
    // badge, which is the surface's own confirmation that the grant stuck.
    await openUsers.click()
    await expect(page.getByText('Assign Users to Role')).toBeVisible({ timeout: 20_000 })
    await dialogSearch(page).fill(ASSIGNEE.email)
    await expect(page.getByText('Currently Assigned')).toBeVisible({ timeout: 15_000 })
    await shot(page, 'users-dialog-currently-assigned')

    // Escape rather than the footer's Cancel: the detail page's own action bar
    // also renders a "Cancel" button, and a bare name lookup matches both.
    await page.keyboard.press('Escape')
    await expect(page.getByText('Assign Users to Role')).toHaveCount(0, { timeout: 15_000 })

    await ctx.close()
  })
})
