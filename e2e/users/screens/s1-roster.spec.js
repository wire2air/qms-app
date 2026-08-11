// Users screenshots · S1 — the roster workspace.
//   The list as an administrator lands on it, free-text search, the three
//   status quick-filter pills (Invited / Inactive / All), the role filter
//   (options + applied), the Create User dialog (blank → filled), and the two
//   denial states.
//
// Every selector here is one USER-J8 / USER-J9 / ROLE-J1 already drive — the
// search box placeholder, the pill group, the role combobox, and the create
// dialog's accessible-name lookups (NOT getByPlaceholder: that matches on a
// substring, so 'e.g. John' also matches the email field's placeholder and
// fails on a strict-mode violation — USER-J8 documents the trap).
//
// TWO SUBJECTS ARE SEEDED, and the pair is the point. "Invited" and "Inactive"
// are different populations of the same INACTIVE status — invited-but-not-
// accepted is INACTIVE + inviteSent, disabled is INACTIVE + !inviteSent — so a
// capture of either pill is only meaningful when the other population also
// exists and is visibly excluded. Both are throwaways owned by this file and
// are never logged in, so unlike USER-J8's subject they can be hard-deleted.
//
// The create dialog is FILLED BUT NEVER SUBMITTED: the state worth capturing is
// the completed form, and submitting would leave a real user (and an audit
// trail that cannot be removed) behind for a screenshot.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, USERS, ROLES, COMPANY_ID, SITES, DEPARTMENTS } from '../../fixtures/cast.js'
import { sql } from '../../fixtures/db.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('users')

// Invited = INACTIVE + invite_sent. Disabled = INACTIVE + NOT invite_sent.
const PENDING = {
  id: 'e2e1f000-0000-4000-8000-000000000091',
  email: 's1-pending@e2e.test',
  first: 'Pia',
  last: 'PendingInvite',
  inviteSent: true,
}
const DISABLED = {
  id: 'e2e1f000-0000-4000-8000-000000000092',
  email: 's1-disabled@e2e.test',
  first: 'Dean',
  last: 'Disabled',
  inviteSent: false,
}

function seedSubject(s) {
  sql(`DELETE FROM users WHERE id = '${s.id}'`)
  sql(
    `INSERT INTO users (id, first_name, last_name, email, user_status_id, company_id,
       language_id, time_zone, site_id, department_id, kind, invite_sent, is_owner,
       created_at, updated_at)
     VALUES ('${s.id}', '${s.first}', '${s.last}', '${s.email}', 'INACTIVE', '${COMPANY_ID}',
       'en', 'America/New_York', '${SITES.primary.id}', '${DEPARTMENTS.quality.id}',
       'INTERNAL', ${s.inviteSent}, false, NOW(), NOW())`,
  )
}

function removeSubject(s) {
  sql(`DELETE FROM invitation_tokens WHERE user_id = '${s.id}'`)
  sql(`DELETE FROM roles_on_users WHERE user_id = '${s.id}'`)
  sql(`DELETE FROM users WHERE id = '${s.id}'`)
}

async function gotoUsers(page) {
  await page.goto('/users', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Users' }).first()).toBeVisible({
    timeout: 30_000,
  })
  // The roster hydrates from IndexedDB via the syncEngine, so "the page
  // rendered" and "the rows are there" are different moments (USER-J9).
  await expect(page.getByRole('cell', { name: USERS.owner.email })).toBeVisible({
    timeout: 30_000,
  })
}

/** The roster's own search box (UsersFilterToolbar → BaseFilterBar). */
function rosterSearch(page) {
  return page.getByPlaceholder('Search users…')
}

/** The status quick-filter pill group (BaseQuickFilterPills, role=group). */
function statusPills(page) {
  return page.getByRole('group', { name: 'User status quick filters' })
}

test.describe.serial('Users screenshots · roster, search, filters, create', () => {
  test.beforeAll(() => {
    seedSubject(PENDING)
    seedSubject(DISABLED)
  })
  test.afterAll(() => {
    removeSubject(PENDING)
    removeSubject(DISABLED)
  })

  test('list, search, status pills and the role filter', async ({ browser }) => {
    test.setTimeout(420_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()

    // ── The roster as it lands ─────────────────────────────────────────────
    await gotoUsers(page)
    await expect(page.getByRole('button', { name: 'Create User' })).toBeVisible()
    await shot(page, 'list')

    // ── Free-text search (client-side over the materialised rows) ──────────
    const search = rosterSearch(page)
    await search.fill('auditor')
    await expect(page.getByRole('cell', { name: USERS.auditor.email })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByRole('cell', { name: USERS.owner.email })).toHaveCount(0)
    await shot(page, 'list-search')

    await search.fill('')
    await expect(page.getByRole('cell', { name: USERS.owner.email })).toBeVisible({
      timeout: 15_000,
    })

    // ── "Invited" — INACTIVE + inviteSent, a pseudo-status (USER-J9) ───────
    const pills = statusPills(page)
    const invited = pills.getByRole('button', { name: 'Invited', exact: true })
    await invited.click()
    await expect(invited).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('cell', { name: PENDING.email })).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByRole('cell', { name: DISABLED.email }),
      'a disabled account is not a pending invite',
    ).toHaveCount(0)
    await shot(page, 'list-pill-invited')

    // ── "Inactive" — deliberately disabled, the other population ───────────
    const inactive = pills.getByRole('button', { name: 'Inactive', exact: true })
    await inactive.click()
    await expect(inactive).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('cell', { name: DISABLED.email })).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByRole('cell', { name: PENDING.email }),
      'a pending invite is not a disabled account',
    ).toHaveCount(0)
    await shot(page, 'list-pill-inactive')

    // ── "All" — both are back, so the absences above were filtering ────────
    const all = pills.getByRole('button', { name: 'All', exact: true })
    await all.click()
    await expect(all).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('cell', { name: PENDING.email })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('cell', { name: DISABLED.email })).toBeVisible()
    await shot(page, 'list-pill-all')

    // ── Role filter (RoleSelectMenu in the filter bar) ─────────────────────
    const roleFilter = page.getByRole('combobox').filter({ hasText: /role/i }).first()
    await roleFilter.click()
    const auditorOption = page.getByRole('option', { name: ROLES.auditor.name, exact: true })
    await expect(auditorOption).toBeVisible({ timeout: 15_000 })
    await shot(page, 'list-role-filter-options')

    await auditorOption.click()
    await expect(page.getByRole('cell', { name: USERS.auditor.email })).toBeVisible({
      timeout: 15_000,
    })
    await expect(
      page.getByRole('cell', { name: USERS.owner.email }),
      'the owner does not hold that role',
    ).toHaveCount(0)
    await shot(page, 'list-role-filter-applied')

    await ctx.close()
  })

  test('the Create User dialog, blank and filled', async ({ browser }) => {
    test.setTimeout(300_000)
    // `owner` is the persona that can both OPEN the dialog (user_management:create)
    // and see its Roles field (role_permission_management:update) — no seeded
    // grant-based cast member holds both, which ROLE-J1 documents at length.
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    await gotoUsers(page)

    await page.getByRole('button', { name: 'Create User' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('textbox', { name: 'Email' })).toBeVisible({ timeout: 15_000 })
    await shot(page, 'create-dialog')

    await dialog.getByRole('textbox', { name: 'First Name' }).fill('Jordan')
    await dialog.getByRole('textbox', { name: 'Last Name' }).fill('Screenshot')
    await dialog.getByRole('textbox', { name: 'Email' }).fill('s1-screenshot@e2e.test')

    // Roles / Primary Site / Department are the three BaseSelects, in that order
    // (USER-J8). Roles is multiple, so the menu stays open until dismissed.
    await dialog.getByRole('combobox').nth(0).click()
    await page.getByRole('option', { name: ROLES.auditor.name, exact: true }).click()
    await page.keyboard.press('Escape')

    await dialog.getByRole('combobox').nth(1).click()
    await page.getByRole('option', { name: SITES.primary.name, exact: true }).click()

    await dialog.getByRole('combobox').nth(2).click()
    await page.getByRole('option', { name: DEPARTMENTS.quality.name, exact: true }).click()

    // force: the real <input> is sr-only and its visual proxy <span> intercepts
    // pointer events, so an unforced check() waits for stability forever.
    await dialog.getByRole('checkbox').check({ force: true })
    await expect(dialog.getByRole('checkbox')).toBeChecked()
    await shot(page, 'create-dialog-filled')

    // Deliberately NOT submitted — see the header. Cancel closes without a write.
    await dialog.getByRole('button', { name: 'Cancel' }).last().click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })

    await ctx.close()
  })

  test('denial states — no permission and unauthenticated', async ({ browser }) => {
    test.setTimeout(180_000)
    // The whole /users subtree is guarded on user_management:read
    // (permissionGuard.js, ADMIN_PERMISSIONS), list and detail alike.
    const denied = await browser.newContext({ storageState: AUTH.noAccess })
    const deniedPage = await denied.newPage()
    await deniedPage.goto('/users', { waitUntil: 'domcontentloaded' })
    await expect(deniedPage).toHaveURL(/\/no-access/, { timeout: 30_000 })
    await shot(deniedPage, 'no-access')
    await denied.close()

    const anon = await browser.newContext() // no session
    const anonPage = await anon.newPage()
    await anonPage.goto('/users', { waitUntil: 'domcontentloaded' })
    await expect(anonPage).toHaveURL(/\/signin/, { timeout: 30_000 })
    await shot(anonPage, 'signin-redirect')
    await anon.close()
  })
})
