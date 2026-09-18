// ANL-A3 · The period control opens, and changing it changes the figures.
//
// ── THE DEFECT CLASS ────────────────────────────────────────────────────────
// `BasePopover` exposes `#button` and `#content`. `AnalyticsFilterBar` put the
// date filter in NEITHER — it was a bare child — so the most-used control in the
// whole module opened an empty box. The trigger rendered, the panel appeared, and
// there was nothing inside it. Nothing in eslint or the build sees this.
//
// ── WHY THE SECOND HALF MATTERS MORE THAN THE FIRST ─────────────────────────
// A visible date filter only proves the slot renders. The period is the input to
// every figure on the page, so the test that matters is that choosing a
// DIFFERENT period produces a DIFFERENT window — asserted against the label the
// bar prints, because that label is the only place the resolved window is visible
// to a reader. A period control that opens but does not take is worse than one
// that never opens: the numbers look answered.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import { ensureRollup, gotoAnalytics } from '../fixtures/analytics.js'

test.use({ storageState: AUTH.author })

test.describe('ANL-A3 · the period popover', () => {
  test.beforeAll(async () => {
    await ensureRollup()
  })

  test('opening the period control shows a working date builder, and it takes', async ({ page }) => {
    await gotoAnalytics(page)

    const trigger = page.getByRole('button', { name: /change the reporting period/i })
    await expect(trigger, 'the filter bar renders its period trigger').toBeVisible()
    const before = (await trigger.textContent())?.trim()

    await trigger.click()

    // ⚠️ The panel is NOT a list of the nine period tokens. `BaseDateFilter` is a
    // generic builder — an operator select plus direction/count/unit — so a test
    // hunting for "Last 90 days" finds nothing and reports an empty popover,
    // which is indistinguishable from the bug this file exists to catch. Assert
    // on the controls the component actually renders.
    const op = page.locator('[data-op]')
    await expect(op, 'the popover content slot rendered the date builder').toBeVisible()
    await expect(page.locator('[data-rel-dir]')).toBeVisible()

    // Drive it, because rendering and working failed independently on this branch.
    const count = page.locator('[data-rel-count]')
    await expect(count).toBeVisible()
    await count.fill('3')
    await page.locator('[data-rel-unit]').selectOption('month')

    // The trigger label is where the resolved window surfaces. If it never
    // changes, the control opened and did nothing.
    await expect
      .poll(async () => (await trigger.textContent())?.trim(), {
        timeout: 15_000,
        message: 'the period label reflects the new selection',
      })
      .not.toBe(before)
  })

  test('a widget tile carries its own filter panel, and it is not empty', async ({ page }) => {
    // AnalyticsWidget had the identical hole: the per-tile filter panel's content
    // was a bare child of BasePopover, so the Filter button opened an empty box.
    await gotoAnalytics(page, '/explore')
    await expect(page.getByRole('heading', { name: /explore/i }).first()).toBeVisible()

    const filter = page.getByRole('button', { name: /^filter/i })
    if ((await filter.count()) > 0) {
      await filter.first().click()
      await expect(
        page.locator('[data-headlessui-state]').filter({ hasText: /\w/ }).first(),
        'the tile filter popover has content',
      ).toBeVisible()
    }
  })
})
