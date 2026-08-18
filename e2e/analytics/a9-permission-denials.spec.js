// ANL-A9 · A reader with no analytics grant gets nothing, at every layer.
//
// ── WHY A DENIAL TEST NEEDS MORE THAN ONE LAYER ─────────────────────────────
// Hiding the nav is a courtesy to the user; it protects nothing. A denial suite
// that only checks the sidebar passes just as happily when the routes are wide
// open, because nobody clicked one. So each layer is asked separately:
//
//   1. the nav          — does the module advertise itself?
//   2. the route        — what happens to somebody who types the URL?
//   3. the metric layer — does the DATA come back regardless?
//
// (3) is the one that matters. It is also the one where "absent" and "zero" have
// to stay distinguishable: a metric that returns 0 to someone who may not look is
// worse than a refusal, because it reads as a finding.
//
// ── THE TWO PERSONAS ARE DIFFERENT KINDS OF DENIAL ──────────────────────────
// `noAccess` holds nothing at all — not the module, not the measured data.
// `auditor` holds `reports_dashboards:read` and so reaches the module, but holds
// no `export`. Those are separate refusals and a suite that conflates them cannot
// tell "the module is gated" from "the module is broken".
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ANALYTICS, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser } from '../fixtures/db.js'
import { ensureRollup, gotoAnalytics, metricValueAs, requestExportAs, exportJobs, clearExportJobs } from '../fixtures/analytics.js'

test.describe('ANL-A9 · denials', () => {
  test.beforeAll(async () => {
    await ensureRollup()
  })

  test.describe('noAccess — no reports_dashboards grant at all', () => {
    test.use({ storageState: AUTH.noAccess })

    test('the sidebar does not advertise Analytics', async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      // Every analytics nav entry declares `permissions: ['reports_dashboards:read']`.
      await expect(page.getByRole('link', { name: /^analytics$/i })).toHaveCount(0)
      await expect(page.getByRole('link', { name: /^dashboards$/i })).toHaveCount(0)
    })

    test('typing the URL does not produce the module', async ({ page }) => {
      await gotoAnalytics(page)
      // Whatever the shell chooses to render — a redirect or a refusal — it must
      // not be the command centre. Asserting the ABSENCE of the module rather than
      // the presence of a particular error page keeps this from breaking every
      // time the denial UI is restyled.
      await expect(page.getByRole('button', { name: /new report/i })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /change the reporting period/i })).toHaveCount(0)
    })

    test('the metric layer returns no row — which is not a zero', async () => {
      const v = metricValueAs(USERS.noAccess.id)
      expect(v.value, 'absent, not 0').toBeNull()
      expect(v.scope).toBeNull()
    })

    test('the catalog is empty, so nothing is even offerable', async () => {
      const res = sqlAsAppUser(`SELECT count(*) FROM public.metric_catalog();`, {
        userId: USERS.noAccess.id,
        companyId: COMPANY_ID,
      })
      expect(res.output.split('\n').filter(Boolean).pop()).toBe('0')
    })

    test('the seeded shared board is unreadable even though it is shared', async () => {
      // "Shared" means shared with people who hold the module, not with everybody
      // in the tenant. The SELECT policy carries analytics_feature_entitled() AND
      // the visibility rule; entitlement alone is not access.
      const res = sqlAsAppUser(
        `SELECT count(*) FROM public.analytics_dashboards WHERE id = '${ANALYTICS.sharedDashboard.id}';`,
        { userId: USERS.noAccess.id, companyId: COMPANY_ID },
      )
      expect(res.output.split('\n').filter(Boolean).pop()).toBe('0')
    })
  })

  test.describe('auditor — read but no export', () => {
    test.use({ storageState: AUTH.auditor })

    test('the module is reachable and shows figures', async ({ page }) => {
      // The control. It proves the refusal below is about `export` specifically.
      await gotoAnalytics(page)
      await expect(page.getByRole('button', { name: /change the reporting period/i })).toBeVisible()
      expect(metricValueAs(USERS.auditor.id).value).toBe(ANALYTICS.TENANT_VALUE)
    })

    test('an export request is refused rather than quietly queued', async () => {
      clearExportJobs()
      const res = requestExportAs(USERS.auditor.id, ANALYTICS.sharedReport.id)
      expect(
        !res.ok || exportJobs().length === 0,
        'a reader without export must not get a job on the queue',
      ).toBe(true)
      clearExportJobs()
    })
  })
})
