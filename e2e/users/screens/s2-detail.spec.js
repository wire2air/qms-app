// Users screenshots · S2 — the user detail page.
//   The record as an administrator sees it (Personal Information with every
//   field inline-editable, the Overview / Role Assignments / Effective Access
//   rail), the role-assignment picker open, the inline name edit, and the same
//   page for a persona who may READ a user but not update one.
//
// The subject is a SEEDED cast member (`auditor`, who holds the E2E Auditor
// role) rather than a throwaway: the page is only worth a screenshot when the
// Role Assignments card has something in it, and a fixture that already carries
// a role costs nothing to set up and nothing to clean up.
//
// NOTHING HERE MUTATES THE SUBJECT. The page autosaves on a deep watcher
// (useAutoSave), so every interaction below is chosen to leave the record
// untouched: the role picker is opened and dismissed without picking, and the
// name edit is entered and left without typing. A screenshot run must not edit
// the tenant's people.
//
// Selectors are ROLE-J1's DOM layer: the rail card's disclosure header
// (`Role Assignments`) doubles as the readiness barrier and exposes its body
// through aria-controls, and the picker's trigger — a label-less BaseButton
// carrying IconPlus — has no accessible name to match on, so the tabler class
// is the handle.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, USERS, ROLES } from '../../fixtures/cast.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('users')

const SUBJECT = USERS.auditor

async function gotoUser(page, id) {
  await page.goto(`/users/${id}`, { waitUntil: 'domcontentloaded' })
  const railCard = page.getByRole('button', { name: 'Role Assignments' })
  await expect(railCard).toBeVisible({ timeout: 30_000 })
  return railCard
}

test.describe.serial('Users screenshots · the detail page', () => {
  test('detail, role assignments picker and the inline name edit', async ({ browser }) => {
    test.setTimeout(300_000)
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()

    // ── The record ─────────────────────────────────────────────────────────
    const railCard = await gotoUser(page, SUBJECT.id)
    await expect(page.getByText('Personal Information')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(SUBJECT.email).first()).toBeVisible()
    await shot(page, 'detail')

    // ── Role Assignments → the picker, opened but never used ───────────────
    const bodyId = await railCard.getAttribute('aria-controls')
    expect(bodyId, 'the rail card exposes its body via aria-controls').toBeTruthy()
    const addRole = page.locator(`#${bodyId} button:has(svg.tabler-icon-plus)`)
    await expect(addRole, 'the owner is offered the role picker').toHaveCount(1)
    await addRole.click()

    // An UNASSIGNED role proves the catalog opened (the assigned one would be
    // on screen either way, as the card's list item).
    const unassigned = page.getByRole('option', { name: ROLES.reviewer.name, exact: true })
    await expect(unassigned).toBeVisible({ timeout: 15_000 })
    await shot(page, 'detail-role-picker')

    await page.keyboard.press('Escape')
    await expect(unassigned, 'dismissed without changing the assignment').toHaveCount(0, {
      timeout: 10_000,
    })

    // ── Inline name edit (click-to-edit, no separate dialog) ───────────────
    await page.getByRole('button', { name: 'Edit user name' }).click()
    const firstName = page.getByPlaceholder('First Name')
    await expect(firstName).toBeVisible({ timeout: 15_000 })
    await expect(page.getByPlaceholder('Last Name')).toBeVisible()
    await shot(page, 'detail-name-edit')

    // Enter leaves the editor. Nothing was typed, so the autosave watcher never
    // fires and the record is exactly as it was found.
    await firstName.press('Enter')
    await expect(firstName).toHaveCount(0, { timeout: 10_000 })

    await ctx.close()
  })

  test('the same record for a persona who may read but not update', async ({ browser }) => {
    test.setTimeout(180_000)
    // roleAdmin holds user_management:READ (so the /users subtree opens) and
    // deliberately no create/update — but DOES hold rpm:update, so the role
    // picker is still offered while every field control is read-only. That
    // split is the F-18 fix, and it is what this capture shows.
    const ctx = await browser.newContext({ storageState: AUTH.roleAdmin })
    const page = await ctx.newPage()

    const railCard = await gotoUser(page, SUBJECT.id)
    await expect(page).toHaveURL(new RegExp(`/users/${SUBJECT.id}`))
    await expect(
      page.getByRole('button', { name: 'Edit user name' }),
      'name editing is refused without user_management:update',
    ).toHaveAttribute('aria-disabled', 'true')

    const bodyId = await railCard.getAttribute('aria-controls')
    await expect(
      page.locator(`#${bodyId} button:has(svg.tabler-icon-plus)`),
      'but role assignment is still offered — it gates on rpm:update',
    ).toHaveCount(1)
    await shot(page, 'detail-readonly-roleadmin')

    await ctx.close()
  })
})
