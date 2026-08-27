// ANL-A5 · Private means absent, not filtered.
//
// `analytics_dashboards_select_rls` and `analytics_reports_select_rls` resolve
// visibility SERVER-SIDE. That distinction is the whole test: a client that
// fetches everything and hides the private rows looks identical on screen and is
// a data leak — the rows are in the browser, in IndexedDB, and in any dev-tools
// session. So each assertion below checks BOTH that the name is off the screen and
// that the row never reached the client at all.
//
// The seeded private artefacts belong to `owner`, not to the reader, because a
// private row of your own is supposed to be visible and proves nothing.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ANALYTICS, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser } from '../fixtures/db.js'
import { ensureRollup, gotoDashboards, gotoReports, gotoAnalytics } from '../fixtures/analytics.js'

test.describe('ANL-A5 · visibility', () => {
  test.beforeAll(async () => {
    await ensureRollup()
  })

  test.describe('as author (not the owner)', () => {
    test.use({ storageState: AUTH.author })

    test("the owner's shared board is listed and the private one is not", async ({ page }) => {
      await gotoDashboards(page)
      await expect(page.getByText(ANALYTICS.sharedDashboard.name).first()).toBeVisible()
      await expect(page.getByText(ANALYTICS.privateDashboard.name)).toHaveCount(0)
    })

    test("the owner's shared report is listed and the private one is not", async ({ page }) => {
      await gotoReports(page)
      await expect(page.getByText(ANALYTICS.sharedReport.name).first()).toBeVisible()
      await expect(page.getByText(ANALYTICS.privateReport.name)).toHaveCount(0)
    })

    test('a private report opened by id shows not-found, and leaks no attribute of it', async ({ page }) => {
      await gotoAnalytics(page, `/reports/${ANALYTICS.privateReport.id}`)
      await expect(page.getByText(/report not found/i)).toBeVisible()
      await expect(page.getByText(ANALYTICS.privateReport.name)).toHaveCount(0)
      // Not even the description, which is where a partial fetch would surface.
      await expect(page.getByText(/owner-only/i)).toHaveCount(0)
    })

    test('the row itself is unreachable under RLS — the client never had it', async () => {
      // The screen assertions above cannot distinguish "server withheld it" from
      // "client hid it". This one can, and it is the assertion that would fail if
      // the SELECT policy were ever relaxed to company-only.
      const readable = sqlAsAppUser(
        `SELECT count(*) FROM public.analytics_reports WHERE id = '${ANALYTICS.privateReport.id}';`,
        { userId: USERS.author.id, companyId: COMPANY_ID },
      )
      expect(readable.ok).toBe(true)
      expect(readable.output.split('\n').filter(Boolean).pop()).toBe('0')

      const boardReadable = sqlAsAppUser(
        `SELECT count(*) FROM public.analytics_dashboards WHERE id = '${ANALYTICS.privateDashboard.id}';`,
        { userId: USERS.author.id, companyId: COMPANY_ID },
      )
      expect(boardReadable.output.split('\n').filter(Boolean).pop()).toBe('0')
    })
  })

  test.describe('as the owner', () => {
    test.use({ storageState: AUTH.owner })

    test('the owner sees both of their own boards', async ({ page }) => {
      // The control. Without it, every assertion above is equally satisfied by
      // "private dashboards are broken for everybody".
      await gotoDashboards(page)
      await expect(page.getByText(ANALYTICS.sharedDashboard.name).first()).toBeVisible()
      await expect(page.getByText(ANALYTICS.privateDashboard.name).first()).toBeVisible()
    })
  })
})
