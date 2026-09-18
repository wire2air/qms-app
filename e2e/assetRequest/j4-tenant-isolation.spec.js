// AR-J4 — E2EALT cannot read or write E2ELAB asset requests, and vice versa.
//
// Modeled on equipment/j5-tenant-isolation.spec.js. `asset_request_select_rls`
// (database/rls.sql:255-259) carries a company-membership subquery via `users`
// (not a bare `company_id = current_company_id()` predicate — the exact shape
// EQ-J5 flags as a WEAKER pattern for `equipment_sel`), so this module has a
// second line of defence beyond REST's own `where: { companyId }` scoping.
// Both layers are probed, in both directions, so a policy that quietly
// stopped matching anything cannot read as a correct guard.
//
// Fixtures: e2e-seed.sql §43b seeds a supplier + PENDING request in E2EALT
// (ALT_REQUEST) specifically because nothing in the seed represented an asset
// request outside E2ELAB before this — a tenant-isolation probe had no
// foreign-tenant fixture to aim at.
import { test, expect } from '@playwright/test'
import { ALT_BASE_URL, ALT_COMPANY_ID, ALT_USERS, AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import { ALT_REQUEST, FIXED_REQUEST, resetFixedRequest } from '../fixtures/assetRequest.js'

const lastLine = (out) => out.trim().split('\n').pop().trim()
const countVisible = (userId, companyId, requestId) =>
  Number(
    lastLine(
      sqlAsAppUser(`SELECT count(*) FROM asset_requests WHERE id = '${requestId}';`, {
        userId,
        companyId,
      }).output,
    ),
  )

test.describe('AR-J4 — cross-tenant isolation', () => {
  test.beforeAll(() => resetFixedRequest())
  test.afterAll(() => resetFixedRequest())

  test('the fixture is on both sides of the boundary', async () => {
    expect(
      Number(sqlValue(`SELECT count(*) FROM asset_requests WHERE id = '${FIXED_REQUEST.id}'`)),
      'E2ELAB holds its fixed request',
    ).toBe(1)
    expect(
      Number(sqlValue(`SELECT count(*) FROM asset_requests WHERE id = '${ALT_REQUEST.id}'`)),
      'E2EALT holds its own',
    ).toBe(1)
  })

  test('REST: E2EALT’s owner gets 404 for an E2ELAB request, and 200 for their own', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
    const page = await ctx.newPage()
    try {
      const foreign = await page.request.get(
        `${ALT_BASE_URL}/api/v1/services/assetRequests/${FIXED_REQUEST.id}`,
      )
      expect(foreign.status(), 'an E2ELAB request is invisible to E2EALT').toBe(404)

      const own = await page.request.get(
        `${ALT_BASE_URL}/api/v1/services/assetRequests/${ALT_REQUEST.id}`,
      )
      expect(own.status(), 'the endpoint works for their own tenant').toBe(200)
      expect((await own.json())?.assetRequest?.title).toBe(ALT_REQUEST.title)
    } finally {
      await ctx.close()
    }
  })

  test('REST: the list endpoint for E2EALT’s own supplier omits every E2ELAB row', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
    const page = await ctx.newPage()
    try {
      const res = await page.request.get(
        `${ALT_BASE_URL}/api/v1/services/suppliers/${ALT_REQUEST.supplierId}/assetRequests`,
      )
      expect(res.status()).toBe(200)
      const titles = ((await res.json())?.assetRequests ?? []).map((r) => r.title)
      expect(titles, 'the alt tenant sees its own request').toContain(ALT_REQUEST.title)
      expect(titles, 'and nothing from E2ELAB').not.toContain(FIXED_REQUEST.title)
    } finally {
      await ctx.close()
    }
  })

  test('a write aimed across the boundary reaches nothing', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })
    const page = await ctx.newPage()
    try {
      // findOrFail scopes by (id, companyId) before any field is touched, so
      // this must be a 404, not a partial write to another tenant's row.
      const res = await page.request.put(
        `${ALT_BASE_URL}/api/v1/services/assetRequests/${FIXED_REQUEST.id}`,
        { data: { title: 'Renamed from the other tenant' } },
      )
      expect(res.status()).toBe(404)
      expect(sqlValue(`SELECT title FROM asset_requests WHERE id = '${FIXED_REQUEST.id}'`)).toBe(
        FIXED_REQUEST.title,
      )
    } finally {
      await ctx.close()
    }
  })

  // WHICH PERSONA THE POLICY CAN ADMIT (measured 2026-09-14).
  // `asset_request_select_rls` ORs three branches: the `is_owner` GUC, a
  // `supplier_management:read` grant, or being an EXTERNAL_SUPPLIER for that
  // supplier. `sqlAsAppUser` pins app.current_user_is_owner='false', so the
  // owner-bypass branch can NEVER fire through this helper — and E2EALT has
  // no roles and no grants of any kind seeded. So the only persona a positive
  // control can use is USERS.author, the sole holder of
  // `supplier_management:read` in E2ELAB. Using an owner here previously made
  // the "sees their own" control assert 1 against a policy that must return
  // 0, which is why it failed while the product was behaving correctly.
  test('RLS holds the same line for a raw app_user session, in both directions', async () => {
    expect(
      countVisible(USERS.author.id, COMPANY_ID, FIXED_REQUEST.id),
      'the supplier_management:read holder sees their own tenant’s request — the policy matches, not merely empty',
    ).toBe(1)
    expect(
      countVisible(USERS.author.id, COMPANY_ID, ALT_REQUEST.id),
      'and cannot see E2EALT’s request',
    ).toBe(0)

    // E2EALT direction is negative-only by necessity: that tenant has no
    // roles/grants seeded, so no persona there can satisfy any OR branch.
    expect(
      countVisible(ALT_USERS.owner.id, ALT_COMPANY_ID, FIXED_REQUEST.id),
      'E2EALT cannot see an E2ELAB request under RLS',
    ).toBe(0)
  })

  test('the portal branch does not leak across tenants either', async () => {
    // SUPPLIER_USER (E2ELAB) has supplier_id = SUPPLIER_IDS.withPortal.
    // asset_request_select_rls's EXTERNAL_SUPPLIER branch is
    // `u.id = current_user_id AND u.supplier_id = asset_requests.supplier_id`
    // — it never compares companies directly, so this is really a check that
    // the branch is a strict supplier_id match rather than "any
    // EXTERNAL_SUPPLIER user id". ALT_REQUEST's supplier_id belongs to the
    // ALT tenant's own seeded supplier, which SUPPLIER_USER's row can never
    // equal, so the EXISTS fails independently of the (also failing) leading
    // company_id predicate — both would have to break for this to pass.
    expect(
      countVisible('e2e10000-0000-4000-8000-000000000009', ALT_COMPANY_ID, ALT_REQUEST.id),
      'E2ELAB’s portal user under an E2EALT company GUC sees nothing',
    ).toBe(0)
  })
})
