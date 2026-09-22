// PW-J8 — Widget structural exclusion, green-expected.
//
// docs/modules/dashboard/14-playwright-journeys.md: "As a role with ncr:read
// only, open Customize and assert the checklist contains EXACTLY kpis,
// my-tasks, open-ncs, quick-actions — proving availableWidgets genuinely
// excludes the other 4 gated widgets from the dialog's data, not merely from
// being checkable." Pins DashboardHome.vue's `availableWidgets` computed
// (`WIDGETS.filter(w => !w.permission || isAllowed([w.permission]))`) as a
// standing regression guard: the dialog's `:widgets` prop IS that filtered
// list, so a widget without the permission was never in the data to begin
// with — there is no hidden checkbox to un-hide by mistake.
//
// Reuses the dedicated `dashboardNoAccess` role from PW-J1 (e2e-seed.sql §49)
// rather than a third persona — grants ncr:read for just this one test and
// revokes it again, same as PW-J1's own round-trip.
import { test, expect } from '@playwright/test'
import { AUTH } from '../fixtures/cast.js'
import { grantToRole } from '../fixtures/permissions.js'
import { openCustomize, checklistLabels } from '../fixtures/dashboard.js'

const ROLE = 'E2E Dashboard NoAccess'

test.describe('PW-J8 · Dashboard Customize checklist is structurally filtered', () => {
  test('ncr:read only — checklist is EXACTLY KPI Summary / My Tasks / Open Nonconformances / Quick Actions', async ({
    browser,
  }) => {
    const revoke = grantToRole(ROLE, 'ncr', 'read')
    const ctx = await browser.newContext({ storageState: AUTH.dashboardNoAccess })
    const page = await ctx.newPage()
    try {
      await page.goto('/dashboard')
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 })

      await openCustomize(page)
      const labels = await checklistLabels(page)
      expect(labels.sort()).toEqual(
        ['KPI Summary', 'My Tasks', 'Open Nonconformances', 'Quick Actions'].sort(),
      )
      // The other 4 gated widgets (CAPAs Due, QC Inspection Lots, Documents
      // Pending Approval, Audits) must be structurally absent, not merely
      // unchecked — the length check above already proves it, this names it.
      for (const excluded of ['CAPAs Due', 'QC Inspection Lots', 'Documents Pending Approval', 'Audits']) {
        expect(labels).not.toContain(excluded)
      }
    } finally {
      revoke()
      await ctx.close()
    }
  })
})
