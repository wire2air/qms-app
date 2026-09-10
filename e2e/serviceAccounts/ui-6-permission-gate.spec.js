// SA-UI-6 — 🟢 The gate is a control, not a hidden menu item. (Journey 7.)
//
// This is the finding the whole module exists because of. The surface service
// accounts REPLACED — personal API keys — carried no `enforcePermission` of any
// kind: the permission was checked in `MainSidebar.vue` and nowhere else, so any
// authenticated tenant user could list, create and revoke keys by typing the
// URL or calling the endpoint. routes/serviceAccounts.js says so in its own
// header, and this file is the browser half of making sure it does not come
// back.
//
// SO BOTH HALVES ARE ASSERTED, ALWAYS TOGETHER:
//   · the nav does not advertise it, AND
//   · the URL does not render it.
// Either alone is the bug. A suite that only checked the sidebar would have
// passed, happily, against the exact code that shipped the original defect.
//
// AND THE SIDEBAR PROBE IS MADE FAIR. "Service Accounts" lives in the Settings
// drill-in rail, which is CLOSED on first paint — so `toHaveCount(0)` against a
// page that never opened it is true no matter what the permissions are, which
// is a green assertion guarding nothing. Both personas open the rail the same
// way before anything is asserted, and the intAdmin control proves the link is
// findable by that route.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'

/**
 * Open the Settings drill-in rail, where the Service Accounts entry lives.
 * Returns whether the rail was reachable at all — for a persona with no
 * settings permission the group itself is absent, which is a stronger denial
 * than a missing child and is reported as such.
 */
async function openSettingsRail(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  // Wait for the shell to hydrate before asserting an absence, or the assertion
  // passes against an empty DOM and proves nothing.
  await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 20_000 })
  const settings = page.getByRole('button', { name: 'Settings', exact: true })
  if ((await settings.count()) === 0) return false
  await settings.first().click()
  await expect(page.getByText('Main Menu', { exact: true })).toBeVisible({ timeout: 10_000 })
  return true
}

test.describe('SA-UI-6 · the permission gate', () => {
  test.describe('noAccess — holds nothing at all', () => {
    test.use({ storageState: AUTH.noAccess })

    test('the nav never offers Service Accounts, even inside the rail it would live in', async ({
      page,
    }) => {
      const railOpened = await openSettingsRail(page)
      await expect(
        page.getByRole('link', { name: 'Service Accounts' }),
        railOpened
          ? 'the rail opened and the entry is not in it'
          : 'the Settings group itself is withheld',
      ).toHaveCount(0)
    })

    test('typing the URL does not produce the screen', async ({ page }) => {
      await page.goto('/service-accounts', { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(/\/no-access/, { timeout: 20_000 })

      // Assert the ABSENCE of the surface as well as the redirect: what matters
      // is that the module did not render, not which refusal page was chosen.
      await expect(page.getByRole('heading', { name: 'Service Accounts' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'New Service Account' })).toHaveCount(0)
    })
  })

  test.describe('CONTROL · intAdmin — holds api_integrations:read', () => {
    test.use({ storageState: AUTH.intAdmin })

    test('the same rail, one persona apart, offers the entry', async ({ page }) => {
      expect(await openSettingsRail(page), 'the rail is reachable for this persona').toBe(true)
      const link = page.getByRole('link', { name: 'Service Accounts' })
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute('href', /\/service-accounts$/)
    })

    test('and the same URL renders the module', async ({ page }) => {
      await page.goto('/service-accounts', { waitUntil: 'domcontentloaded' })
      await expect(page).not.toHaveURL(/\/no-access/)
      await expect(page.getByRole('heading', { name: 'Service Accounts' })).toBeVisible({
        timeout: 20_000,
      })
      await expect(page.getByRole('button', { name: 'New Service Account' }).first()).toBeVisible()
    })
  })
})
