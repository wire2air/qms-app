// PW-J16 · SSO setup documentation.
//
// The SSO tab is configuration an admin does ONCE, against a console we don't
// control, where a single mistyped character fails with an error nobody can
// read. The setup guide is therefore part of the feature, not decoration — so
// these check that it is reachable from the tab, that it actually covers the
// three providers we claim to support, and that it survives a content rebuild.
// The article is generated into a bundle at build time, which is exactly the
// kind of wiring that breaks silently.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'

test.use({ storageState: AUTH.owner })

test.describe('PW-J16 · SSO setup documentation', () => {
  test('the tab links to the setup guide, and it covers all three providers', async ({ page }) => {
    await page.goto('/organization-security')
    await page.getByRole('tab', { name: /single sign-on/i }).click()

    const guide = page.getByRole('button', { name: /Help: Single Sign-On/i })
    await expect(guide).toBeVisible()
    await guide.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Give these to your identity provider', { timeout: 10_000 })
    // Named explicitly: an admin arrives here knowing only their provider.
    await expect(dialog).toContainText('Microsoft Entra ID')
    await expect(dialog).toContainText('Okta')
    await expect(dialog).toContainText('Google Workspace')
    // The break-glass rule is the one thing that must never quietly disappear
    // from the docs — it is why requiring SSO cannot lock a company out.
    await expect(dialog).toContainText('owners')

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    // Back on the tab: the value an admin must copy, plus its help icon.
    await expect(page.getByRole('button', { name: 'Copy Audience / Entity ID' })).toBeVisible()
    const spLabel = page.locator('label', { hasText: 'Audience / Entity ID' }).first()
    await expect(spLabel.locator('svg')).toBeVisible()
  })

  test('the article also stands alone in the Help Center', async ({ page }) => {
    await page.goto('/help/KB/administration/single-sign-on')
    await expect(page.getByRole('heading', { name: /Single Sign-On/i }).first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText('Require SSO', { exact: false }).first()).toBeVisible()
  })
})
