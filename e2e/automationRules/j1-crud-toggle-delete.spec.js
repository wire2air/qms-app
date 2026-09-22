// PW-J1 — Author, edit, toggle, and soft-delete a rule.
//
// docs/modules/automation-rules/14-playwright-journeys.md called this out as
// the module's Phase-3 roadmap, "not implemented" — this is the first pass at
// it. Drives the standalone /automation-rules page end to end: create ->
// visible in the list with the right columns AND the right DB row shape ->
// edit (change the trigger) -> toggle Active off/on with no dialog -> delete
// (confirm dialog) -> soft-deleted (deleted_at set, not a hard delete), row
// gone from the list.
import { test, expect } from '@playwright/test'
import { AUTH } from '../fixtures/cast.js'
import {
  purgeRule,
  findRule,
  selectInDialog,
  addActionInDialog,
  toggleActiveInRow,
  expectActiveInRow,
} from '../fixtures/automationRules.js'

const NAME = `E2E J1 Notify on NC ${Date.now()}`

test.describe('PW-J1 · Automation Rules CRUD, toggle, soft-delete', () => {
  test.beforeAll(() => purgeRule(NAME))
  test.afterAll(() => purgeRule(NAME))

  test('automationOwner creates, sees it listed, edits, toggles, and deletes a rule', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: AUTH.automationOwner })
    const page = await ctx.newPage()
    try {
      await page.goto('/automation-rules')
      // Generous timeout on this FIRST navigation only: on a cold dev server
      // this route's Vite chunk (plus QuickNotificationPanel's several lookup
      // pickers) hasn't been transformed yet, and that one-time compile can
      // exceed a normal 15s budget even though the page then renders
      // correctly — see PW-J4's identical assertion, which uses the default
      // and passes once this route is warm.
      await expect(page.getByRole('heading', { name: 'Automation Rules' })).toBeVisible({
        timeout: 45_000,
      })

      // ── Create ──────────────────────────────────────────────────────────
      await page.getByRole('button', { name: 'New Rule' }).click()
      await expect(page.getByText('New Automation Rule')).toBeVisible()

      await page
        .getByPlaceholder('e.g. Notify QA on critical events')
        .fill(NAME)
      await selectInDialog(page, 'Object', 'Nonconformances')
      // Trigger is left at its default (CREATED / "When created") — the edit
      // step below is what proves a trigger change persists.
      await addActionInDialog(page, 'Notify Owner / Assignee')
      await page.getByRole('button', { name: 'Create Rule' }).click()

      // Generous timeout on this FIRST mutation of a fresh run only: on a
      // freshly-started `api` process, PostGraphile's first hit of a given
      // mutation type appears to pay a one-time compile/plan-cache cost far
      // above steady-state latency — PW-J3's identical createAutomationRule
      // call, run moments later against the same process, resolves quickly.
      // Confirmed via trace inspection: the payload sent here is byte-for-byte
      // correct (right objectType/trigger/actions), the request just never got
      // a response inside a shorter window.
      await expect(page.getByText(NAME).first()).toBeVisible({ timeout: 60_000 })

      await expect
        .poll(() => findRule(NAME)?.id, { timeout: 20_000, message: 'the rule landed in Postgres' })
        .toBeTruthy()
      const created = findRule(NAME)
      expect(created.object_type).toBe('Nonconformance')
      expect(created.trigger).toBe('CREATED')
      expect(created.is_active).toBe(true)
      expect(created.deleted_at).toBeNull()
      expect(created.actions).toEqual([{ type: 'NOTIFY_OWNER', config: {} }])

      // ── Edit — change the trigger, assert both UI and DB reflect it, same row id ──
      const row = page.locator('tr', { has: page.getByText(NAME, { exact: true }) }).first()
      await row.getByRole('button', { name: 'Edit' }).click()
      await expect(page.getByText('Edit Automation Rule')).toBeVisible()
      await selectInDialog(page, 'Trigger', 'When status changes')
      await page.getByRole('button', { name: 'Save Rule' }).click()
      await expect(page.getByText('Edit Automation Rule')).toBeHidden({ timeout: 10_000 })

      await expect
        .poll(() => findRule(NAME)?.trigger, { timeout: 15_000, message: 'trigger updated' })
        .toBe('STATUS_CHANGED')
      expect(findRule(NAME).id).toBe(created.id)

      // ── Toggle Active off, then on — no dialog, DB flips is_active ────────
      await toggleActiveInRow(page, NAME)
      await expect
        .poll(() => findRule(NAME)?.is_active, { timeout: 15_000, message: 'toggled off' })
        .toBe(false)
      await expectActiveInRow(page, NAME, false)

      await toggleActiveInRow(page, NAME)
      await expect
        .poll(() => findRule(NAME)?.is_active, { timeout: 15_000, message: 'toggled back on' })
        .toBe(true)
      await expectActiveInRow(page, NAME, true)

      // ── Delete — confirm dialog, then a soft-delete (not a hard delete) ──
      const rowAgain = page.locator('tr', { has: page.getByText(NAME, { exact: true }) }).first()
      await rowAgain.getByRole('button', { name: 'Delete' }).click()
      await expect(page.getByText(`Delete "${NAME}"?`)).toBeVisible({ timeout: 10_000 })
      await page.getByRole('button', { name: 'Delete', exact: true }).last().click()

      await expect
        .poll(() => findRule(NAME)?.deleted_at, { timeout: 15_000, message: 'soft-deleted' })
        .toBeTruthy()
      await expect(page.getByText(NAME)).toHaveCount(0, { timeout: 15_000 })
    } finally {
      await ctx.close()
    }
  })
})
