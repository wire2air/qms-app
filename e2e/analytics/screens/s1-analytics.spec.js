// Analytics screenshots · S1 — every state the module can be in.
//   Command centre, dashboards list, a populated board, the builder dialogs,
//   reports list and detail, schedules, alerts, insights and the explorer.
// Selectors are the journeys' — nothing new invented here.
//
// The captures double as the review surface the module never had: four of its
// screens shipped with invisible buttons because nobody looked at them. A folder
// of PNGs per state is the cheapest standing defence against that recurring.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, ANALYTICS } from '../../fixtures/cast.js'
import {
  createDashboardViaUi,
  dashboardByName,
  ensureRollup,
  gotoAnalytics,
  uniqueName,
} from '../../fixtures/analytics.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('analytics')

test.describe.serial('Analytics screenshots', () => {
  test.beforeAll(async () => {
    await ensureRollup()
  })

  test('command centre, dashboards, reports, alerts, explorer', async ({ browser }) => {
    test.setTimeout(420_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()

    await gotoAnalytics(page)
    await expect(page.getByRole('button', { name: /change the reporting period/i })).toBeVisible()
    await shot(page, 'command-centre')

    // The period popover open — the control that used to render an empty box.
    // `BaseDateFilter` is a builder, not a token list (see ANL-A3), so the proof
    // that the content slot rendered is its operator select, not a token label.
    await page.getByRole('button', { name: /change the reporting period/i }).click()
    await expect(page.locator('[data-op]')).toBeVisible()
    await shot(page, 'period-popover-open')
    await page.keyboard.press('Escape')

    await gotoAnalytics(page, '/dashboards')
    await expect(page.getByText(ANALYTICS.sharedDashboard.name).first()).toBeVisible()
    await shot(page, 'dashboards-list')

    await gotoAnalytics(page, `/dashboards/${ANALYTICS.sharedDashboard.id}`)
    await expect(page.getByText(ANALYTICS.sharedWidget.title).first()).toBeVisible()
    await shot(page, 'dashboard-populated')

    await gotoAnalytics(page, '/reports')
    await expect(page.getByText(ANALYTICS.sharedReport.name).first()).toBeVisible()
    await shot(page, 'reports-list')

    // The dialog whose submit button was dead. Captured with the real footer.
    await page.getByRole('button', { name: /new report/i }).click()
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Create report', exact: true })).toBeVisible()
    await shot(page, 'report-builder-dialog')
    await page.getByRole('dialog').getByRole('button', { name: /cancel/i }).click()

    await gotoAnalytics(page, `/reports/${ANALYTICS.sharedReport.id}`)
    await expect(page.getByText(ANALYTICS.sharedReport.name).first()).toBeVisible()
    await shot(page, 'report-detail')

    await gotoAnalytics(page, '/alerts')
    await shot(page, 'alerts-list')

    await gotoAnalytics(page, '/explore')
    await shot(page, 'explorer')

    await ctx.close()
  })

  test('the empty states, with their actions visible', async ({ browser }) => {
    test.setTimeout(300_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()

    // A fresh board — the state whose "Add widget" button was invisible.
    // Navigate by id rather than clicking the card: the list is a live query, so
    // "wait for the card, then click it" races the sync, and `networkidle` never
    // settles against the app's sync socket (ANL trap #1).
    const name = uniqueName('S1 empty board')
    await gotoAnalytics(page, '/dashboards')
    await createDashboardViaUi(page, name)

    await expect
      .poll(() => dashboardByName(name), { timeout: 20_000, message: 'dashboard row appears' })
      .not.toBeNull()
    await gotoAnalytics(page, `/dashboards/${dashboardByName(name).id}`)

    await expect(page.getByText(/no widgets yet/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /add widget/i }).first()).toBeVisible()
    await shot(page, 'dashboard-empty-with-action')

    await gotoAnalytics(page, `/reports/${ANALYTICS.ABSENT_ID}`)
    await expect(page.getByText(/report not found/i)).toBeVisible()
    await shot(page, 'report-not-found')

    await ctx.close()
  })

  test('the denial state', async ({ browser }) => {
    test.setTimeout(180_000)
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    const page = await ctx.newPage()
    await gotoAnalytics(page)
    await shot(page, 'no-access')
    await ctx.close()
  })
})
