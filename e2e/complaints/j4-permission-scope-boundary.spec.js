// CMP-J4 — permission and scope boundaries on `complaints` (SITE tier) and
// `complaint_management` (ASSIGNED-TO tier).
//
// TWO DIFFERENT SCOPE SHAPES, PROBED SEPARATELY. `complaints` offers real
// own/site/tenant tiers (D1, fixed 2026-08-11 — 11-security-review.md §5):
// `complaintSiteUser` holds `complaints:read/update` at SITE scope (Primary
// Site) and nothing else, so a Primary-Site complaint they don't own must be
// visible/editable and a Secondary-Site one must not. `complaint_management`
// has ONLY tenant + assigned-to scope (no site, no department, no own tier —
// 11-security-review.md §5, 10-permission-matrix.md) — there is no
// site-scoped persona to probe there, so this file only checks the zero-grant
// half on that module (route-level 403 / nav visibility), which is the
// boundary that DOES apply to both modules identically.
//
// EVERY POSITIVE PROBE IS PAIRED WITH ITS NEGATIVE. A policy that quietly
// stopped matching anything would refuse everyone and read as a perfect
// guard against the denial half alone — the same discipline
// equipment/EQ-J5's tenant-isolation file uses.
import { test, expect } from '@playwright/test'
import { AUTH, COMPLAINTS, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser } from '../fixtures/db.js'

const COMPANY_ID = 'e2e00001-0000-4000-8000-000000000001'

const lastLine = (out) => out.trim().split('\n').pop().trim()
const countVisible = (userId, complaintId) =>
  Number(
    lastLine(
      sqlAsAppUser(`SELECT count(*) FROM complaints WHERE id = '${complaintId}';`, {
        userId,
        companyId: COMPANY_ID,
      }).output,
    ),
  )

test.describe('CMP-J4 · permission and scope boundaries', () => {
  test('RLS: complaintSiteUser (SITE scope, Primary) sees the Primary-Site complaint and not the Secondary-Site one', () => {
    expect(
      countVisible(USERS.complaintSiteUser.id, COMPLAINTS.siteScoped.id),
      'the SITE-scope grant admits a Primary-Site row they do not own',
    ).toBe(1)
    expect(
      countVisible(USERS.complaintSiteUser.id, COMPLAINTS.secondarySite.id),
      'and refuses the identical shape at a site they are not assigned to — the tier is enforced, not merely advertised',
    ).toBe(0)

    // The pair that gives both numbers meaning: complaintOwner (TENANT scope)
    // sees both, so the refusal above is the SITE tier filtering, not a
    // company_id mismatch or the rows not existing.
    expect(countVisible(USERS.complaintOwner.id, COMPLAINTS.siteScoped.id)).toBe(1)
    expect(countVisible(USERS.complaintOwner.id, COMPLAINTS.secondarySite.id)).toBe(1)
  })

  test('RLS: a zero-grant holder sees neither complaint, even though the rows exist', () => {
    expect(
      countVisible(USERS.noAccess.id, COMPLAINTS.siteScoped.id),
      'no complaints grant at all — refused regardless of site',
    ).toBe(0)
    expect(countVisible(USERS.noAccess.id, COMPLAINTS.secondarySite.id)).toBe(0)
  })

  test('UI: complaintSiteUser can open and edit the in-scope complaint', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.complaintSiteUser })
    const page = await ctx.newPage()
    try {
      await page.goto(`/complaints/${COMPLAINTS.siteScoped.id}`)
      // The complaint number renders in the breadcrumb, a list row and the
      // detail panel at once — scope to the detail panel to avoid a
      // strict-mode violation, and use .first() there too (the number also
      // repeats inside the panel itself).
      await expect(
        page
          .getByLabel('Details')
          .getByText(COMPLAINTS.siteScoped.complaintNumber, { exact: false })
          .first(),
      ).toBeVisible({
        timeout: 30_000,
      })
      // read/update, not create/close/delete: no "New Complaint" affordance
      // should be reachable, and the create route itself must refuse them.
      const res = await page.request.post('/api/v1/services/complaints', {
        data: { subject: 'CMP-J4 should never be created', description: 'x' },
      })
      expect(res.status(), 'complaintSiteUser holds no complaints:create grant').toBe(403)
    } finally {
      await ctx.close()
    }
  })

  test('UI: complaintSiteUser cannot reach the out-of-scope Secondary-Site complaint', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.complaintSiteUser })
    const page = await ctx.newPage()
    try {
      // RLS withholds the row rather than the route refusing — same pattern
      // as audits/auditee detail routes: the page loads, the record does not.
      await page.goto(`/complaints/${COMPLAINTS.secondarySite.id}`)
      // Three elements carry "not found"-shaped text (breadcrumb, heading,
      // helper copy) — anchor on the most specific one instead of a bare
      // regex match across the whole page.
      await expect(
        page.getByText('Complaint not found', { exact: true }),
        'the row is invisible under RLS, so the detail page reads as not-found',
      ).toBeVisible({ timeout: 30_000 })
    } finally {
      await ctx.close()
    }
  })

  test('nav + route guard: a zero-grant persona gets no /complaints entry point', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    try {
      await page.goto('/complaints')
      // permissionGuard.js gates 'complaints' on complaints:read — noAccess
      // holds nothing, so this must bounce rather than render the list.
      await expect(page).toHaveURL(/\/no-access/, { timeout: 15_000 })
    } finally {
      await ctx.close()
    }
  })

  test('nav + route guard: a zero-grant persona gets no /customer-complaints entry point either', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    try {
      await page.goto('/customer-complaints')
      await expect(page).toHaveURL(/\/no-access/, { timeout: 15_000 })
    } finally {
      await ctx.close()
    }
  })

  test('REST: a zero-grant persona is refused create on both modules', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    try {
      const internal = await page.request.post('/api/v1/services/complaints', {
        data: { subject: 'CMP-J4 denial probe', description: 'x' },
      })
      expect(internal.status()).toBe(403)

      const support = await page.request.post('/api/v1/services/customerComplaints', {
        data: { subject: 'CMP-J4 denial probe (support)', description: 'x' },
      })
      expect(support.status()).toBe(403)
    } finally {
      await ctx.close()
    }
  })
})
