// Quality Events screenshots · S1 — the list workspace, the report form and the
// denial states.
//   The events list (KPI strip + quick-view pills), a quick view, the cascading
//   filter menu (Status → Open) and the filtered result, the Events Dashboard,
//   the "Log Event" dialog blank and filled, the new event's detail page, then
//   the no-access redirect and the sign-in bounce.
//
// The persona is `qeManager` — the only cast member holding quality_events
// create+read+update+close (e2e-seed.sql §28b), which is what makes both the
// "Log Event" affordance and the detail page's controls render. Filter/pill
// selectors are the same BaseFilterMenu / BaseQuickFilterPills ones the CAPA
// screenshot suite drives; the create dialog's fields are
// QualityEventCreateDialog.vue's.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, QUALITY_EVENTS } from '../../fixtures/cast.js'
// Generic dialog helpers. They live in fixtures/audits.js only because that is
// the project's first home for them (the same way fixtures/qcInspection.js
// borrows from fixtures/documents.js) — nothing about them is audit-specific,
// and the Quality Events create surface IS a dialog, so the dialog-scoped
// variants are the correct ones here.
import { fillRichText, selectInDialog } from '../../fixtures/audits.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('qualityEvents')

/** The dimension filter menu trigger (scoped by aria-haspopup — as in CAPA S1). */
function filterMenu(page) {
  return page.locator('button[aria-haspopup="menu"]').filter({ hasText: 'Filter' })
}

test.describe.serial('Quality Events screenshots · list, filters, report form', () => {
  test('list, quick views, the filter menu and the dashboard', async ({ browser }) => {
    test.setTimeout(300_000)
    const ctx = await browser.newContext({ storageState: AUTH.qeManager })
    const page = await ctx.newPage()

    // ── The workspace ──────────────────────────────────────────────────────
    // The seeded standing event (EV-E2E-0001, OPEN) guarantees the list has a
    // real row under the default "All open" quick view.
    await page.goto('/qualityEvents')
    // Assert a real row first: BaseListLayout renders an extra "Log Event"
    // empty-state button while the live query is still resolving, so anything
    // asserted on that label before the table is ready can hit two matches.
    await expect(page.getByText(QUALITY_EVENTS.standing.number).first()).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByRole('button', { name: 'Log Event' }).first()).toBeVisible({
      timeout: 20_000,
    })
    const pillGroup = page.getByRole('group', { name: 'Quick views' })
    await expect(pillGroup.getByRole('button', { name: 'All open', exact: true })).toBeVisible({
      timeout: 20_000,
    })
    await shot(page, 'list')

    // ── A different lifecycle slice of the same table ──────────────────────
    await pillGroup.getByRole('button', { name: 'Assigned to me', exact: true }).click()
    await expect(
      pillGroup.getByRole('button', { name: 'Assigned to me', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    await shot(page, 'list-quick-view-mine')

    await pillGroup.getByRole('button', { name: 'All open', exact: true }).click()
    await expect(pillGroup.getByRole('button', { name: 'All open', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // ── Cascading filter menu → Status → Open ──────────────────────────────
    await filterMenu(page).click()
    await expect(page.getByRole('menuitem', { name: 'Status' })).toBeVisible({ timeout: 10_000 })
    await shot(page, 'list-filter-menu')

    await page.getByRole('menuitem', { name: 'Status' }).click()
    await expect(page.getByRole('menuitemcheckbox', { name: 'Open', exact: true })).toBeVisible({
      timeout: 10_000,
    })
    await shot(page, 'list-filter-status-options')

    await page.getByRole('menuitemcheckbox', { name: 'Open', exact: true }).click()
    await page.keyboard.press('Escape')
    // The applied dimension renders as a removable token above the table.
    await expect(page.getByRole('button', { name: 'Clear all' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(QUALITY_EVENTS.standing.number).first()).toBeVisible({
      timeout: 20_000,
    })
    await shot(page, 'list-filter-applied')

    // ── The module's dashboard ─────────────────────────────────────────────
    await page.goto('/qualityEvents')
    await page.getByRole('button', { name: 'Dashboard' }).click()
    await expect(page.getByRole('heading', { name: 'Events Dashboard' })).toBeVisible({
      timeout: 30_000,
    })
    await shot(page, 'dashboard')

    await ctx.close()
  })

  test('the Log Event dialog, blank then filled, and the new event', async ({ browser }) => {
    test.setTimeout(300_000)
    const ctx = await browser.newContext({ storageState: AUTH.qeManager })
    const page = await ctx.newPage()

    await page.goto('/qualityEvents')
    // Wait for the table to be ready before clicking — see the note in the
    // first test about the empty state's duplicate "Log Event" button.
    await expect(page.getByText(QUALITY_EVENTS.standing.number).first()).toBeVisible({
      timeout: 30_000,
    })
    await page.getByRole('button', { name: 'Log Event' }).first().click()
    // "Log Event" is the trigger button, the dialog title AND the submit button
    // — anchor the open-check on the heading role.
    await expect(page.getByRole('heading', { name: 'Log Event' })).toBeVisible({ timeout: 20_000 })
    await shot(page, 'create-dialog')

    // Site + Department are prefilled from the reporter's own profile
    // (QualityEventCreateDialog applyUserDefaults; qeManager sits at the
    // Primary Site / Quality department), so only these four are filled here.
    const title = `E2E Screens Event ${Date.now()}`
    await page.getByPlaceholder('Short summary of the observation').fill(title)
    await fillRichText(
      page,
      'What did you observe? Where? Any immediate context.',
      'Screenshot run — operator observed a torque reading drifting on line 1.',
    )
    await selectInDialog(page, 'Category', QUALITY_EVENTS.categories.deviation.name)
    await selectInDialog(page, 'Severity', QUALITY_EVENTS.severities.major.name)

    // The rich-text body is the one field with no `placeholder` attribute to
    // assert on (TipTap renders the hint from CSS), so assert its content.
    await expect(page.locator('[contenteditable="true"]').first()).toContainText('torque reading')
    await shot(page, 'create-dialog-filled')

    // The footer submit repeats the trigger's label — take the last one.
    await page.getByRole('button', { name: 'Log Event' }).last().click()
    await expect(page).toHaveURL(/\/qualityEvents\/[0-9a-f-]{36}/, { timeout: 45_000 })
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 })
    await shot(page, 'detail-new-event')

    await ctx.close()
  })

  test('denial states — no permission and unauthenticated', async ({ browser }) => {
    test.setTimeout(120_000)

    const denied = await browser.newContext({ storageState: AUTH.noAccess })
    const deniedPage = await denied.newPage()
    await deniedPage.goto('/qualityEvents')
    await expect(deniedPage).toHaveURL(/\/no-access/, { timeout: 30_000 })
    await shot(deniedPage, 'no-access')
    await denied.close()

    const anon = await browser.newContext() // no session
    const anonPage = await anon.newPage()
    await anonPage.goto('/qualityEvents')
    await expect(anonPage).toHaveURL(/\/signin/, { timeout: 30_000 })
    await shot(anonPage, 'signin-redirect')
    await anon.close()
  })
})
