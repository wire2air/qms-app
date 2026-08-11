// Documents screenshots · S7 — the denial states around the module.
//   A user with no document permission lands on /no-access; an unauthenticated
//   visit is bounced to the sign-in page. (Both are PW-J9 assertions.)
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH } from '../../fixtures/cast.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('documents')

test.describe('Documents screenshots · permission + auth states', () => {
  test('no document permission → /no-access', async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    await page.goto('/documents')
    await expect(page).toHaveURL(/\/no-access/, { timeout: 30_000 })
    await shot(page, 'no-access')
    await ctx.close()
  })

  test('unauthenticated visit → sign-in', async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext() // no session
    const page = await ctx.newPage()
    await page.goto('/documents')
    await expect(page).toHaveURL(/\/signin/, { timeout: 30_000 })
    await shot(page, 'signin-redirect')
    await ctx.close()
  })
})
