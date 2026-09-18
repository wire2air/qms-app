// ANL-A4 · One stored question, two correct answers.
//
// This is the module's central claim, and the reason a dashboard stores no
// numbers: sharing a board shares the QUESTION, never the ANSWER. Two people open
// the same widget, the same metric, the same period, and each legitimately sees a
// different figure, because the figure is resolved under the reader's own access
// scope at render time.
//
// ── WHY IT NEEDS TWO PERSONAS AND NOT ONE ───────────────────────────────────
// A single reader can never demonstrate this. `author` holds `ncr:read` at TENANT
// scope; `siteRoamer` holds it at SITE scope from Primary Site (§15). §31 puts
// four seeded nonconformances at Primary and two at Secondary, so over the seeded
// fact month the same widget is worth 6 to one of them and 4 to the other — and
// BOTH are right.
//
// ── WHY THE EXPECTED FIGURE IS COMPUTED, NOT HARD-CODED ─────────────────────
// The widget's period is `last_12_months`, which includes the current month, and
// every other suite in this repo creates nonconformances now. So the tile's number
// is not a constant — it is whatever `metric_value()` returns FOR THAT READER over
// the server's own window. Asking the function is the only way to assert the exact
// number the tile should show without the assertion decaying by tomorrow. The
// fixed 6/4 pair is asserted separately, over the fact month, where it is stable.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ANALYTICS, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sqlAsAppUser } from '../fixtures/db.js'
import { ensureRollup, gotoAnalytics, metricValueAs } from '../fixtures/analytics.js'

const SITE_ROAMER_ID = 'e2e10000-0000-4000-8000-000000000012'

// Without this the UI tests below run with no storageState at all and land on
// /signin, which reads in the report as "the dashboard did not render". The
// per-test browser context further down overrides it for the second reader.
test.use({ storageState: AUTH.author })

test.describe('ANL-A4 · the same shared board reads differently for two readers', () => {
  test.beforeAll(async () => {
    await ensureRollup()
  })

  test('the fact month resolves to 6 at tenant scope and 4 at site scope', async () => {
    const tenant = metricValueAs(USERS.author.id)
    const site = metricValueAs(SITE_ROAMER_ID)

    expect(tenant.scope, 'author holds ncr:read at tenant').toBe('tenant')
    expect(site.scope, 'siteRoamer holds ncr:read at site').toBe('site')
    expect(tenant.value).toBe(ANALYTICS.TENANT_VALUE)
    expect(site.value).toBe(ANALYTICS.SITE_VALUE)
    expect(
      tenant.value,
      'if these ever match, the scope premise has gone and every later assertion is vacuous',
    ).toBeGreaterThan(site.value)
  })

  test('the tenant-scoped reader sees their own figure on the shared board', async ({ page }) => {
    const expected = metricValueAs(USERS.author.id, { defaultWindow: true })
    expect(expected.value, 'the metric resolves for this reader').not.toBeNull()

    await gotoAnalytics(page, `/dashboards/${ANALYTICS.sharedDashboard.id}`)
    await expect(page.getByText(ANALYTICS.sharedDashboard.name).first()).toBeVisible()

    // The KPI card carries no test id, and `locator('*').filter(...)` matches
    // every ancestor up to <html>. The board holds three tiles since ANL-A11
    // needed an order to change, but only ONE of them is a single-number tile
    // for this metric, so the title and the figure being on the page is still
    // the same claim, said plainly.
    await expect(page.getByText(ANALYTICS.sharedWidget.title).first()).toBeVisible()
    await expect(
      page.getByText(String(expected.value), { exact: true }).first(),
    ).toBeVisible({ timeout: 30_000 })
  })

  test('the site-scoped reader sees a DIFFERENT figure on the same board', async ({ browser }) => {
    const expectedTenant = metricValueAs(USERS.author.id, { defaultWindow: true })
    const expectedSite = metricValueAs(SITE_ROAMER_ID, { defaultWindow: true })
    expect(
      expectedSite.value,
      'the two readers must disagree, or the test proves nothing',
    ).not.toBe(expectedTenant.value)

    const ctx = await browser.newContext({ storageState: AUTH.siteRoamer })
    const page = await ctx.newPage()
    try {
      await gotoAnalytics(page, `/dashboards/${ANALYTICS.sharedDashboard.id}`)
      // Reachable: it is shared. That is the half people remember.
      await expect(page.getByText(ANALYTICS.sharedDashboard.name).first()).toBeVisible()

      await expect(page.getByText(ANALYTICS.sharedWidget.title).first()).toBeVisible()
      await expect(
        page.getByText(String(expectedSite.value), { exact: true }).first(),
      ).toBeVisible({ timeout: 30_000 })
      // And the half that matters: the author's number is NOT on this screen.
      await expect(page.getByText(String(expectedTenant.value), { exact: true })).toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })

  test('a reader with no grant on the measured module gets NULLs, not a zero', async () => {
    // Absent ≠ zero. A zero is an answer; NULL is "no answer for you", and the UI
    // has to tell them apart or it will print "0 nonconformances" to somebody who
    // simply may not look.
    //
    // ⚠️ THE EXACT SHAPE, because it changed on 2026-08-19 and this comment
    // previously stated the opposite. There are TWO ways to get no answer and
    // they are different rows, not different values:
    //
    //   analytics grant, no measured-module grant → ONE row, NULL value, NULL
    //     scope. The single NULL deliberately does not distinguish "no data"
    //     from "you may not look"; `metric_catalog()` is the authority on what
    //     is offerable. Pinned at the integration layer, which has a persona for
    //     it (scope.test.js) — the E2E seed does not.
    //   no analytics grant at all → ZERO rows. The registry row itself is
    //     invisible, because closing F-11 put the analytics module grant on
    //     analytics_metrics.
    //
    // `noAccess` holds NOTHING, so it is the second case. Asserting `rows` is
    // what keeps this comment honest: until the helper reported it, both cases
    // collapsed to `{ value: null }` and this file and a9 drifted into claiming
    // opposite things about the same persona.
    const denied = metricValueAs(USERS.noAccess.id)
    expect(denied.value, 'absent, not 0').toBeNull()
    expect(denied.scope).toBeNull()
    expect(denied.rows, 'noAccess holds no analytics grant — the metric is not even visible').toBe(
      0,
    )

    const catalog = sqlAsAppUser('SELECT count(*) FROM public.metric_catalog();', {
      userId: USERS.noAccess.id,
      companyId: COMPANY_ID,
    })
    expect(catalog.output.split('\n').filter(Boolean).pop(), 'nothing is offerable').toBe('0')
  })
})
