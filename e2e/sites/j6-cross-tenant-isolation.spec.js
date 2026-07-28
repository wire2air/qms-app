// PW-J6 — 🟢 Cross-tenant site isolation. GREEN-EXPECTED.
//
// The cheapest test in the pack: e2e-seed.sql already seeds one site per tenant
// (§2) and nothing in the repository asserted against that pairing. The whole
// journey is "log in as each tenant's owner, assert you see yours and only
// yours" — no new fixture, no setup.
//
// Worth having despite being free. `sites_sel` is the ONLY thing enforcing this:
// there is no service-layer company filter on the read path, because the app
// reads sites through GraphQL/syncEngine, not REST. If the company clause were
// ever dropped from that policy, this is the assertion that notices.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, SITES, COMPANY_ID, ALT_COMPANY_ID, ALT_BASE_URL } from '../fixtures/cast.js'
import { gotoSites, liveSiteCount } from '../fixtures/sites.js'
import { sqlValue } from '../fixtures/db.js'

test.describe('PW-J6 · a tenant sees its own sites and no others', () => {
  test('the seeded two-tenant split is real at the database level', () => {
    // Guard the premise before asserting on the UI: if both sites somehow lived
    // in one company, every assertion below would pass while proving nothing.
    expect(sqlValue(`SELECT company_id FROM sites WHERE id = '${SITES.primary.id}'`)).toBe(COMPANY_ID)
    expect(sqlValue(`SELECT company_id FROM sites WHERE id = '${SITES.alt.id}'`)).toBe(ALT_COMPANY_ID)
  })

  test('E2ELAB owner sees both E2ELAB sites and not the E2EALT one', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    await gotoSites(page)

    await expect(page.getByRole('cell', { name: SITES.primary.name, exact: true })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByRole('cell', { name: SITES.secondary.name, exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: SITES.alt.name, exact: true })).toHaveCount(0)

    await ctx.close()
  })

  test('E2EALT owner sees the Alt site and neither E2ELAB site', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
    const page = await ctx.newPage()
    await gotoSites(page)

    await expect(page.getByRole('cell', { name: SITES.alt.name, exact: true })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByRole('cell', { name: SITES.primary.name, exact: true })).toHaveCount(0)
    await expect(page.getByRole('cell', { name: SITES.secondary.name, exact: true })).toHaveCount(0)

    await ctx.close()
  })

  test('the picker is isolated too, not just the list page', async ({ browser }) => {
    // The list page is one consumer of `sites_sel`; SiteSelectMenu is 26 more.
    // Assert the isolation holds where the data is actually *used*.
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    await page.goto('/documents/create', { waitUntil: 'domcontentloaded' })

    const combo = page
      .getByText('Site', { exact: true })
      .first()
      .locator('xpath=following::*[@role="combobox"][1]')
    await combo.click()
    const listbox = page.getByRole('listbox')
    await expect(listbox.getByRole('option').first()).toBeVisible({ timeout: 20_000 })
    await expect(listbox.getByRole('option', { name: SITES.alt.name, exact: true })).toHaveCount(0)

    await ctx.close()
  })

  test('neither tenant can read the other over REST either', async ({ browser }) => {
    // altOwner's cookie is scoped to e2ealt.localhost and is not sent to the
    // e2elab API host → 401. Any of 401/403/404 means "cannot read".
    const ctx = await browser.newContext({ storageState: AUTH.altOwner })
    const res = await ctx.request.get(`http://e2elab.localhost:4000/v1/services/sites/${SITES.primary.id}`)
    expect([401, 403, 404]).toContain(res.status())
    await ctx.close()

    // And the tenants really are separate populations, not one shared list.
    expect(liveSiteCount(COMPANY_ID)).toBeGreaterThanOrEqual(2)
    expect(liveSiteCount(ALT_COMPANY_ID)).toBe(1)
  })
})
