// ANL-A10 · Nothing analytics crosses a tenant boundary.
//
// ── WHY ANALYTICS NEEDS ITS OWN ISOLATION TEST ──────────────────────────────
// Every other module stores rows and RLS filters them. Analytics AGGREGATES first
// and filters after, which is the one shape where a tenant leak does not look like
// one: a rollup bucket is a single row summarising many facts, so a policy that
// forgets `company_id` produces a plausible number rather than somebody else's
// visible record. Nobody notices a total that is 12% too high.
//
// The rollup is written by a worker running as superuser with no SET ROLE, and
// that is deliberate — a bucket is the aggregate over ALL facts in it, so
// computing it under any one user's scope would bake that user's visibility into
// a shared row. Safety therefore comes entirely from the shape of what is stored
// (the scope keys are carried through verbatim, never used to filter) and from the
// read-time policy. This spec is the test of that second half.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { ALT_BASE_URL, ALT_COMPANY_ID, ALT_USERS, ANALYTICS, AUTH, COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlAsAppUser } from '../fixtures/db.js'
import { ensureRollup } from '../fixtures/analytics.js'

const lastLine = (out) => out.split('\n').filter(Boolean).pop()

test.describe('ANL-A10 · tenant isolation', () => {
  test.beforeAll(async () => {
    await ensureRollup()
  })

  test('the alt tenant cannot read E2ELAB rollup rows', async () => {
    const res = sqlAsAppUser(
      `SELECT count(*) FROM public.analytics_rollup WHERE company_id = '${COMPANY_ID}';`,
      { userId: ALT_USERS.owner.id, companyId: ALT_COMPANY_ID },
    )
    expect(res.ok).toBe(true)
    expect(lastLine(res.output), 'no cross-tenant rollup rows').toBe('0')
  })

  test('the alt tenant cannot read E2ELAB dashboards, reports, alerts or runs', async () => {
    for (const table of [
      'analytics_dashboards',
      'analytics_widgets',
      'analytics_reports',
      'analytics_report_schedules',
      'analytics_report_runs',
      'analytics_alerts',
      'analytics_alert_events',
      'analytics_insights',
      'analytics_forecasts',
      'analytics_snapshot',
    ]) {
      const res = sqlAsAppUser(
        `SELECT count(*) FROM public.${table} WHERE company_id = '${COMPANY_ID}';`,
        { userId: ALT_USERS.owner.id, companyId: ALT_COMPANY_ID },
      )
      expect(res.ok, `${table}: ${res.error}`).toBe(true)
      expect(lastLine(res.output), `${table} leaked across tenants`).toBe('0')
    }
  })

  test('a metric resolved in the alt tenant does not count E2ELAB facts', async () => {
    // The aggregate-shaped leak. E2ELAB's seeded month holds 6 nonconformances; if
    // the executor ever dropped its company predicate this would come back with
    // them included, and the number would still look entirely reasonable.
    const alt = sqlAsAppUser(
      `SELECT COALESCE(sum(numerator), 0) FROM public.analytics_rollup
         WHERE metric_key = '${ANALYTICS.METRIC}' AND period_start = '${ANALYTICS.FACT_MONTH.start}';`,
      { userId: ALT_USERS.owner.id, companyId: ALT_COMPANY_ID },
    )
    expect(Number(lastLine(alt.output)), 'the alt tenant sums none of E2ELAB\'s month').toBe(0)

    // And the control: superuser, no RLS, sees exactly the seeded six. Without it a
    // zero above could equally mean the refresh never ran.
    const truth = sql(
      `SELECT sum(numerator) FROM public.analytics_rollup
        WHERE company_id = '${COMPANY_ID}' AND metric_key = '${ANALYTICS.METRIC}'
          AND period_start = '${ANALYTICS.FACT_MONTH.start}'`,
    )
    expect(Number(truth), 'the facts really are there to be leaked').toBe(ANALYTICS.TENANT_VALUE)
  })

  test('the alt tenant cannot export an E2ELAB report', async () => {
    const res = sqlAsAppUser(
      `SELECT public.request_report_export('${ANALYTICS.sharedReport.id}'::uuid, 'xlsx');`,
      { userId: ALT_USERS.owner.id, companyId: ALT_COMPANY_ID },
    )
    expect(res.ok, 'an unreadable report cannot be enqueued for export').toBe(false)
  })

  test.describe('through the alt tenant browser', () => {
    test.use({ storageState: AUTH.altOwner, baseURL: ALT_BASE_URL })

    test("E2ELAB's shared board is not on the alt tenant's list", async ({ page }) => {
      await page.goto('/analytics/dashboards')
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(ANALYTICS.sharedDashboard.name)).toHaveCount(0)
    })

    test("E2ELAB's board opened by id is not found", async ({ page }) => {
      await page.goto(`/analytics/dashboards/${ANALYTICS.sharedDashboard.id}`)
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(ANALYTICS.sharedDashboard.name)).toHaveCount(0)
    })
  })
})
