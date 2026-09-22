// Shared UI flows + DB assertions for the Automation Rules journeys.
//
// The module is CRUD entirely through the SyncEngine (GraphQL) — there is no
// dedicated REST route (see docs/modules/automation-rules/14-playwright-
// journeys.md §2). Writes are driven through the UI here rather than a REST
// helper for that reason; direct SQL is used only for pre/post-test purge and
// reading back the persisted row shape.
//
// SELECTS ARE SCOPED TO THE DIALOG, not just "the first following combobox on
// the page" (documents.js's plain helper). The list page behind
// AutomationRuleBuilder renders a DataTable column literally labelled
// "Actions" (the action-summary column), so an unscoped
// getByText('Actions').first() resolves to that header — earlier in the DOM
// than the dialog's own "Actions" section caption — and the xpath walk from
// there lands on whatever combobox happens to come next in document order,
// which is the WRONG field. Mirrors fixtures/audits.js's selectInDialog for
// the identical reason (its own header comment: "the audits list page uses
// the same column labels the create dialog uses").
import { expect } from '@playwright/test'
import { sqlValue } from './db.js'

export const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

/** Purge any rule left behind by a prior failed run, by exact name. */
export function purgeRule(name) {
  sqlValue(`DELETE FROM automation_rules WHERE name = ${quote(name)}`)
}

/** The automation_rules row, straight out of Postgres (bypasses RLS). */
export function findRule(name) {
  const out = sqlValue(
    `SELECT row_to_json(r) FROM (
       SELECT id, object_type, trigger, condition_tree, actions, is_active, deleted_at
       FROM automation_rules WHERE name = ${quote(name)} ORDER BY created_at DESC LIMIT 1
     ) r`,
  )
  return out ? JSON.parse(out) : null
}

function dialog(page) {
  return page.locator('[role="dialog"]').last()
}

/** Open a labelled BaseSelect INSIDE the current dialog (leaves the listbox open). */
export async function openSelectInDialog(page, fieldLabel) {
  const anchor = dialog(page).getByText(fieldLabel, { exact: true }).first()
  await anchor.locator('xpath=following::*[@role="combobox"][1]').click()
}

/** Open a labelled BaseSelect INSIDE the current dialog and pick an option by text. */
export async function selectInDialog(page, fieldLabel, optionText) {
  await openSelectInDialog(page, fieldLabel)
  await page.getByRole('listbox').getByRole('option', { name: optionText, exact: true }).first().click()
}

/**
 * Pick an action type in the "Add action…" select and click the icon-only
 * add (+) button next to it. The button carries no text/title/aria-label
 * (just `<IconPlus>`), so it can't be found by accessible name — it's the
 * first `<button>` in document order after the "Actions" section caption,
 * which is safe as long as no condition row (with its own "Remove" button)
 * was added first.
 */
export async function addActionInDialog(page, actionLabel) {
  await selectInDialog(page, 'Actions', actionLabel)
  await dialog(page)
    .getByText('Actions', { exact: true })
    .locator('xpath=following::button[1]')
    .click()
}

/**
 * Toggle the row's Active switch on the list page. `BaseSwitch` renders
 * role="switch"; scope to the row so a multi-row list can't pick up a
 * different rule's toggle.
 */
export async function toggleActiveInRow(page, ruleName) {
  const row = page.locator('tr', { has: page.getByText(ruleName, { exact: true }) }).first()
  await row.getByRole('switch').click()
}

/** Assert the row's Active switch reflects the given state. */
export async function expectActiveInRow(page, ruleName, isActive) {
  const row = page.locator('tr', { has: page.getByText(ruleName, { exact: true }) }).first()
  await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', String(isActive))
}
