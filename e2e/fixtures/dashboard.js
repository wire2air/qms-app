// Shared UI helpers for the Dashboard journeys.
//
// SELECTORS ARE SCOPED TO THE CUSTOMIZE DIALOG. The main sidebar carries its
// own "My Tasks" nav link and the page itself has widget titles rendered as
// plain headings — an unscoped text/role lookup for a widget's checklist row
// would just as happily match the sidebar link or the grid card. Mirrors
// fixtures/automationRules.js's `dialog(page)` scoping for the identical
// reason.
//
// THE CHECKLIST ROW'S CHECKBOX HAS NO USABLE ACCESSIBLE NAME. Each row in
// DashboardCustomizeDialog.vue is `<label>{BaseCheckbox}{{ w.label }}</label>`
// — the widget label is a text node OUTSIDE BaseCheckbox, which wraps the
// real `<input>` in its OWN internal (empty) `<label>`. The input's nearest
// ancestor label is that inner, textless one, so `getByLabel(w.label)` does
// not resolve to it. Locate the OUTER `<label>` by its text instead, then the
// checkbox within it — a structural query, not a name-based one.
import { expect } from '@playwright/test'

function dialog(page) {
  return page.locator('[role="dialog"]').last()
}

/** Open the Customize dialog and return its locator. */
export async function openCustomize(page) {
  await page.getByRole('button', { name: 'Customize', exact: true }).click()
  const d = dialog(page)
  await expect(d.getByText('Customize Dashboard', { exact: true })).toBeVisible({ timeout: 10_000 })
  return d
}

/** The checklist row `<label>` for one widget, scoped to the open dialog. */
export function checklistRow(page, widgetLabel) {
  return dialog(page).locator('label', { hasText: widgetLabel })
}

/** The checkbox INSIDE that row — what to assert checked/click. */
export function checklistCheckbox(page, widgetLabel) {
  return checklistRow(page, widgetLabel).getByRole('checkbox')
}

/**
 * Every widget label currently offered in the open Customize dialog.
 *
 * Each row nests TWO `<label>` elements — the outer one from
 * DashboardCustomizeDialog.vue (carries the widget's label text) and
 * BaseCheckbox's own internal one (wraps just the checkbox, no text) — so a
 * bare `label` locator returns one blank entry per row alongside the real
 * one. Filtering to non-blank innerText leaves exactly the widget rows.
 */
export async function checklistLabels(page) {
  const rows = dialog(page).locator('label')
  const count = await rows.count()
  const labels = []
  for (let i = 0; i < count; i++) {
    const text = (await rows.nth(i).innerText()).trim()
    if (text) labels.push(text)
  }
  return labels
}
