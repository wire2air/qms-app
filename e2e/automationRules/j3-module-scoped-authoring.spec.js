// PW-J3 — Module-scoped rule authoring, from the Form Template builder.
//
// Covers UJ-06/UJ-07 (docs/modules/automation-rules/14-playwright-journeys.md):
// a promoted Module's own "Automation" tab (FormTemplateAutomation.vue ->
// FormTemplateAutomationRules.vue) reuses the SAME AutomationRuleBuilder
// dialog in "module mode" — the Object picker hidden, objectType fixed to the
// module's internalName ('e2emod') — and the rule it creates must show up in
// BOTH places: this tab's own list (filtered to the module) AND the
// standalone /automation-rules list (the "no per-module filter" behavior
// UJ-07 names), with its Object column resolving to the module's display name
// rather than the raw key.
//
// No new fixtures needed. `/templates` carries no route guard (a template/
// reference route, tenant-public like /rca-templates — permissionGuard.js has
// no 'templates' entry), and the "Automation" nav button itself isn't
// permission-gated either — only the New/Edit/Delete affordances INSIDE the
// tab are (F-11, 2026-09-07: automation_rules:manage), which `automationOwner`
// already holds. Reuses the e2emod module fixture (e2e-seed.sql §35) rather
// than seeding a second promoted Module.
import { test, expect } from '@playwright/test'
import { AUTH, AUTOMATION_RULES } from '../fixtures/cast.js'
import { purgeRule, findRule, addActionInDialog } from '../fixtures/automationRules.js'

const NAME = `E2E J3 Module Rule ${Date.now()}`

test.describe('PW-J3 · Automation Rules — module-scoped authoring', () => {
  test.beforeAll(() => purgeRule(NAME))
  test.afterAll(() => purgeRule(NAME))

  test('automationOwner authors a rule from the module Automation tab; it lists in both places', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.automationOwner })
    const page = await ctx.newPage()
    try {
      // Generous timeout on this first navigation of the test: like the other
      // specs in this project, a cold/busy dev server can take well past a
      // normal 15-20s budget to compile+render a route on its first hit —
      // confirmed by screenshot in a prior flaky run: the link WAS rendered
      // correctly, the assertion just gave up before the page finished.
      await page.goto(`/templates/${AUTOMATION_RULES.moduleTemplateId}`)
      await expect(page.getByRole('link', { name: 'Automation' })).toBeVisible({ timeout: 45_000 })
      await page.getByRole('link', { name: 'Automation' }).click()
      await expect(page.getByRole('heading', { name: 'Automation', exact: true })).toBeVisible({
        timeout: 15_000,
      })

      // New rule — lowercase "rule", distinct from the standalone page's
      // "New Rule" (FormTemplateAutomationRules.vue's own button text).
      await page.getByRole('button', { name: 'New rule' }).click()
      await expect(page.getByText('New Automation Rule')).toBeVisible()

      // No "Object" field in module mode — objectType is fixed to 'e2emod'.
      await expect(page.locator('[role="dialog"]').last().getByText('Object', { exact: true })).toHaveCount(0)

      await page.getByPlaceholder('e.g. Notify QA on critical events').fill(NAME)
      await addActionInDialog(page, 'Notify Owner / Assignee')
      await page.getByRole('button', { name: 'Create Rule' }).click()

      // Same generous timeout as PW-J1's identical assertion, and for the
      // same reason: whichever test's createAutomationRule call runs FIRST
      // against a given `api` process pays a one-time cold compile/plan-cache
      // tax (confirmed via trace inspection debugging PW-J1) — which test
      // that is depends on run order (whole project vs. this file alone), so
      // both specs need the same headroom rather than assuming the other one
      // always goes first.
      await expect(page.getByText(NAME).first()).toBeVisible({ timeout: 60_000 })

      await expect
        .poll(() => findRule(NAME)?.id, { timeout: 20_000, message: 'the rule landed in Postgres' })
        .toBeTruthy()
      const created = findRule(NAME)
      expect(created.object_type).toBe(AUTOMATION_RULES.moduleInternalName)
      expect(created.trigger).toBe('CREATED')
      expect(created.actions).toEqual([{ type: 'NOTIFY_OWNER', config: {} }])

      // Cross-list visibility (UJ-07): the SAME rule, no per-module filter,
      // with the Object column resolved to the module's display name.
      await page.goto('/automation-rules')
      await expect(page.getByRole('heading', { name: 'Automation Rules' })).toBeVisible({
        timeout: 45_000,
      })
      const row = page.locator('tr', { has: page.getByText(NAME, { exact: true }) }).first()
      await expect(row).toBeVisible({ timeout: 15_000 })
      await expect(row.getByText(AUTOMATION_RULES.moduleTitle)).toBeVisible()
    } finally {
      await ctx.close()
    }
  })
})
