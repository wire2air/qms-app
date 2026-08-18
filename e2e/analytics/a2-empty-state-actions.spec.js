// ANL-A2 · Every empty state's call to action is reachable.
//
// ── THE DEFECT CLASS ────────────────────────────────────────────────────────
// `BaseEmptyState` exposes exactly one slot, `#action`. Five screens on this
// branch passed a bare `<BaseButton>` instead, so the button was discarded —
// no warning, no error, just absent markup. The expensive one was DashboardDetail's
// "No widgets yet" state: the primary call to action on every freshly created
// dashboard was invisible, which makes a new board look like a dead end.
//
// ── WHY EACH ASSERTION CLICKS RATHER THAN ONLY LOOKING ──────────────────────
// A visible button proves the slot renders. Clicking it proves it is WIRED —
// the same distinction that made the report footer's Save look fine and do
// nothing. Both halves failed independently on this branch, so both are checked.
//
// The not-found states carry a second property worth pinning: a private record
// belonging to somebody else and a record that does not exist must be
// INDISTINGUISHABLE. If "not found" and "not yours" render differently, the
// screen is an existence oracle for other people's private work.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ANALYTICS } from '../fixtures/cast.js'
import { ensureRollup, gotoAnalytics, gotoDashboards, dashboardByName, uniqueName } from '../fixtures/analytics.js'

test.use({ storageState: AUTH.author })

test.describe('ANL-A2 · empty-state actions render and work', () => {
  test.beforeAll(async () => {
    await ensureRollup()
  })

  test('a brand-new dashboard offers "Add widget" and the button opens the dialog', async ({ page }) => {
    const name = uniqueName('ANL-A2 board')
    await gotoDashboards(page)

    await page.getByLabel('New dashboard').fill(name)
    await page.getByRole('button', { name: /^create$/i }).click()

    const board = await expect
      .poll(() => dashboardByName(name), { timeout: 20_000, message: 'dashboard row appears' })
      .not.toBeNull()
      .then(() => dashboardByName(name))

    await gotoAnalytics(page, `/dashboards/${board.id}`)

    await expect(page.getByText(/no widgets yet/i)).toBeVisible()
    // The whole finding, in one locator: this button lived in a slot that did
    // not exist, so a new board presented no way forward at all.
    const add = page.getByRole('button', { name: /add widget/i })
    await expect(add.first()).toBeVisible()

    // Wired, not merely present. The empty state's button and the header's are
    // the same action; take the one inside the empty state.
    await add.last().click()
    // The dialog root is a zero-box wrapper (see fixtures/analytics.js) — assert
    // on what is inside it. That the widget dialog's own submit button reads
    // "Add widget" is the same regression check A1 makes for the report builder:
    // AnalyticsWidgetDialog had the identical dead-footer defect.
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Add widget', exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
  })

  test('an unknown report id offers a way back, and takes it', async ({ page }) => {
    await gotoAnalytics(page, `/reports/${ANALYTICS.ABSENT_ID}`)
    await expect(page.getByText(/report not found/i)).toBeVisible()
    const back = page.getByRole('button', { name: /back to reports/i })
    await expect(back, 'the empty state renders its action').toBeVisible()
    await back.click()
    await expect(page).toHaveURL(/\/analytics\/reports\/?$/)
  })

  test('an unknown dashboard id offers a way back, and takes it', async ({ page }) => {
    await gotoAnalytics(page, `/dashboards/${ANALYTICS.ABSENT_ID}`)
    await expect(page.getByText(/dashboard not found/i)).toBeVisible()
    const back = page.getByRole('button', { name: /back to dashboards/i })
    await expect(back).toBeVisible()
    await back.click()
    await expect(page).toHaveURL(/\/analytics\/dashboards\/?$/)
  })

  test('an unknown alert id offers a way back, and takes it', async ({ page }) => {
    await gotoAnalytics(page, `/alerts/${ANALYTICS.ABSENT_ID}`)
    await expect(page.getByText(/alert not found/i)).toBeVisible()
    const back = page.getByRole('button', { name: /back to alerts/i })
    await expect(back).toBeVisible()
    await back.click()
    await expect(page).toHaveURL(/\/analytics\/alerts\/?$/)
  })

  test("someone else's private board is indistinguishable from one that does not exist", async ({ page }) => {
    // Same screen, same words. If these two ever diverge, the not-found state
    // has become a way to enumerate other people's private dashboards.
    await gotoAnalytics(page, `/dashboards/${ANALYTICS.privateDashboard.id}`)
    await expect(page.getByText(/dashboard not found/i)).toBeVisible()
    await expect(page.getByText(ANALYTICS.privateDashboard.name)).toHaveCount(0)
  })
})
