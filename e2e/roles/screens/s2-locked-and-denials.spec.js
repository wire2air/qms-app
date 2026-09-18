// Roles screenshots · S2 — the lock, and the two denial states.
//   A locked role's detail page (read-only, with Unlock offered and the matrix
//   bulk controls withdrawn), the same role's row menu in the list (no status
//   change on offer), and the /roles denial states.
//
// The locked state is captured for the persona who holds
// role_permission_management:update — that is the whole point. `canEdit` is
// `canUpdateRole && !isLocked`, so a locked role must present as read-only EVEN
// TO someone with full authority over roles; otherwise they meet the database
// trigger as a raw error toast instead of an explained state. The assertions
// are ROLE-J5's DOM test, unchanged: Unlock present, Lock absent, and the
// matrix's "Make Admin" bulk control gone.
//
// Nothing here writes. `restoreRolesFixtures()` runs first only to guarantee
// the §30 fixture is locked and ACTIVE at rest — an earlier journey that failed
// midway through unlock → edit → relock would otherwise leave this file
// capturing the wrong state.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, ROLES } from '../../fixtures/cast.js'
import { restoreRolesFixtures } from '../../fixtures/roles.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('roles')

/** The roles table's own search box (DataTable `searchable`). */
function tableSearch(page) {
  return page.getByPlaceholder('Search…', { exact: true }).first()
}

test.describe.serial('Roles screenshots · a locked role and the denials', () => {
  test.beforeAll(() => restoreRolesFixtures())

  test('a locked role refuses edits, and says so', async ({ browser }) => {
    test.setTimeout(300_000)
    const ctx = await browser.newContext({ storageState: AUTH.roleAdmin })
    const page = await ctx.newPage()

    // ── The detail page ────────────────────────────────────────────────────
    await page.goto(`/roles/${ROLES.locked.id}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(ROLES.locked.name).first()).toBeVisible({ timeout: 30_000 })

    await expect(
      page.getByRole('button', { name: 'Unlock' }),
      'the lock is presented as removable, not as a dead end',
    ).toBeVisible({ timeout: 20_000 })
    await expect(
      page.getByRole('button', { name: 'Lock', exact: true }),
      'and the Lock action is not offered on an already-locked role',
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Make Admin' }),
      'matrix bulk controls are withdrawn while the role is locked',
    ).toHaveCount(0)
    await shot(page, 'detail-locked')

    // ── The same role in the list ──────────────────────────────────────────
    await page.goto('/roles', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'Create New Role' })).toBeVisible({
      timeout: 30_000,
    })
    await tableSearch(page).fill(ROLES.locked.name)
    const row = page.getByRole('row').filter({ hasText: ROLES.locked.name }).first()
    await expect(row).toBeVisible({ timeout: 20_000 })
    await shot(page, 'list-locked-row')

    await row.getByRole('button', { name: 'More actions' }).click()
    await expect(
      page.getByRole('menuitem', { name: 'Clone Role' }),
      'cloning a locked role is still offered — it writes a different row',
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByRole('menuitem', { name: 'Deactivate Role' }),
      'but no status change is offered while the role is locked',
    ).toHaveCount(0)
    await shot(page, 'list-locked-row-menu')
    await page.keyboard.press('Escape')

    await ctx.close()
  })

  test('denial states — no permission and unauthenticated', async ({ browser }) => {
    test.setTimeout(180_000)
    // The whole /roles subtree is guarded on role_permission_management:read
    // (permissionGuard.js, ADMIN_PERMISSIONS), list and detail alike.
    const denied = await browser.newContext({ storageState: AUTH.noAccess })
    const deniedPage = await denied.newPage()
    await deniedPage.goto('/roles', { waitUntil: 'domcontentloaded' })
    await expect(deniedPage).toHaveURL(/\/no-access/, { timeout: 30_000 })
    await shot(deniedPage, 'no-access')

    // The detail route is guarded too — an admin module has no row-level
    // exception, so a deep link is refused exactly like the list.
    await deniedPage.goto(`/roles/${ROLES.locked.id}`, { waitUntil: 'domcontentloaded' })
    await expect(deniedPage).toHaveURL(/\/no-access/, { timeout: 30_000 })
    await shot(deniedPage, 'no-access-detail')
    await denied.close()

    const anon = await browser.newContext() // no session
    const anonPage = await anon.newPage()
    await anonPage.goto('/roles', { waitUntil: 'domcontentloaded' })
    await expect(anonPage).toHaveURL(/\/signin/, { timeout: 30_000 })
    await shot(anonPage, 'signin-redirect')
    await anon.close()
  })
})
