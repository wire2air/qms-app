// Shared UI flows for the documents journeys. Selector strategy: BaseSelect
// renders role="combobox" → role="listbox"/"option", so selects are driven by
// (field label text) → first following combobox in document order.
import { expect } from '@playwright/test'
import { FIXTURES } from './cast.js'
import { sqlValue } from './db.js'

const FILL_MARKER = 'E2E-FILLED'

/** Unique, greppable document title for one test run. */
export function uniqueTitle(tag) {
  return `E2E ${tag} ${Date.now()}`
}

/** The first combobox that follows the field label in document order. */
function comboboxAfterLabel(page, fieldLabel) {
  return page
    .getByText(fieldLabel, { exact: true })
    .first()
    .locator('xpath=following::*[@role="combobox"][1]')
}

/**
 * Select the first option of a BaseSelect via keyboard — stable against the
 * listbox open/candidate-load animation (clicking an animating option flakes).
 */
async function selectFirstByKeyboard(combo) {
  await combo.click()
  await combo.press('ArrowDown')
  await combo.press('Enter')
}

/** Open a labelled select and choose an option by its visible text. */
export async function selectOption(page, fieldLabel, optionText) {
  const combo = comboboxAfterLabel(page, fieldLabel)
  await combo.click()
  await page.getByRole('listbox').getByRole('option', { name: optionText }).first().click()
}

/** Open a labelled select and pick the first option (keyboard, stable). */
export async function selectFirstOption(page, fieldLabel) {
  await selectFirstByKeyboard(comboboxAfterLabel(page, fieldLabel))
}

/**
 * Create a document from the seeded SOP template with the seeded approval
 * workflow. Ends on the new document's detail page. Returns the title.
 */
export async function createSopDocument(page, title) {
  await page.goto('/documents')
  await page.getByRole('button', { name: 'Create Document' }).click()
  await expect(page).toHaveURL(/\/documents\/create/)

  // Template first — it prefills prefix, review cadence and sections.
  await selectOption(page, 'Document Template', FIXTURES.sopTemplateName)
  await page.getByPlaceholder('e.g. Clean Room Sterilization Protocol').fill(title)

  await selectFirstOption(page, 'Site')
  await selectFirstOption(page, 'Department')

  // The workflow picker is a clickable-row list, not a combobox.
  await page
    .getByRole('button', { name: `Select workflow ${FIXTURES.approvalWorkflowName}` })
    .click()

  await page.getByRole('button', { name: 'Create Document' }).click()
  await expect(page).toHaveURL(/\/documents\/(?!create)[0-9a-f-]{36}/, { timeout: 20_000 })
  await expect(page.getByText(title).first()).toBeVisible()
  return title
}

/**
 * Fill every empty section of the current DRAFT version so the
 * submit-for-review completeness gate clears.
 */
export async function fillAllSections(page, documentId) {
  // Each body section is a <section :id=uuid> containing one .section-content
  // rich-text editor. Scope to those so we never type into an unrelated
  // contenteditable, and re-resolve per pass (TipTap re-renders on autosave).
  const selector = 'section .section-content [contenteditable="true"]'
  await expect(page.locator(selector).first()).toBeVisible({ timeout: 15_000 })
  const count = await page.locator(selector).count()
  expect(count, 'editable body sections').toBeGreaterThan(0)

  const filledCount = () =>
    Number(
      sqlValue(
        `SELECT count(*) FROM document_sections
          WHERE document_id = '${documentId}' AND deleted_at IS NULL
            AND content LIKE '%${FILL_MARKER}%'`,
      ),
    )

  // Fill one section, then wait for THAT save to land before touching the next
  // — filling a sibling mid-save can revert the previous section, so confirm
  // each persist before advancing. Requires documentId for the DB barrier.
  for (let i = 0; i < count; i++) {
    const target = i + 1
    for (let attempt = 0; attempt < 3 && filledCount() < target; attempt++) {
      const editor = page.locator(selector).nth(i)
      await editor.scrollIntoViewIfNeeded()
      await editor.click()
      await page.keyboard.insertText(`${FILL_MARKER} section ${i + 1} content.`)
      await page.locator('body').click({ position: { x: 5, y: 5 } })
      const deadline = Date.now() + 8_000
      while (Date.now() < deadline && filledCount() < target) {
        await page.waitForTimeout(500)
      }
    }
    expect(filledCount(), `section ${i + 1} persisted`).toBeGreaterThanOrEqual(target)
  }
}

/**
 * Submit the current draft through the workflow preview dialog.
 * Expects a complete draft on the document detail page.
 */
/**
 * @param {import('@playwright/test').Page} page
 * @param {{ reviewersByStep?: string[] }} [opts] reviewer display name to pick
 *   per step (index 0 = step 1). Falls back to the first candidate.
 */
export async function submitForReview(page, opts = {}) {
  const { reviewersByStep = [] } = opts
  await page.getByRole('button', { name: /submit for review/i }).click()

  // Pre-workflow gates may interpose. The seeded SOP template enables training,
  // so a "Finish training setup" reminder appears — disable training and submit.
  const trainingGate = page.getByRole('button', { name: /disable training.*submit/i })
  if (await trainingGate.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await trainingGate.click()
  }
  // A collaborator reminder may also interpose; proceed if present.
  const collabGate = page.getByRole('button', { name: /submit anyway|proceed|continue/i })
  if (await collabGate.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await collabGate.click()
  }

  // Workflow preview dialog — identified by its per-step reviewer helper text.
  await expect(page.getByText(/pick the reviewer\(s\) for each step/i)).toBeVisible({
    timeout: 20_000,
  })
  const dialog = page.getByRole('dialog').filter({ hasText: /pick the reviewer/i })

  // Submit is disabled until at least one reviewer is picked per step. Each
  // step exposes a reviewer combobox — open each and select its first candidate.
  const pickers = dialog.getByRole('combobox')
  const pickerCount = await pickers.count()
  for (let i = 0; i < pickerCount; i++) {
    const combo = pickers.nth(i)
    await combo.scrollIntoViewIfNeeded()
    const wanted = reviewersByStep[i]
    if (wanted) {
      await combo.click()
      await page.getByRole('listbox').getByRole('option', { name: wanted }).first().click()
    } else {
      // Keyboard nav is stable against the listbox open/candidate-load animation:
      // ArrowDown highlights the first option, Enter selects it.
      await selectFirstByKeyboard(combo)
    }
  }

  const submitBtn = dialog.getByRole('button', { name: 'Submit for Review' })
  await expect(submitBtn).toBeEnabled({ timeout: 5_000 })
  await submitBtn.click()
  await expect(page.getByText(/in review/i).first()).toBeVisible({ timeout: 20_000 })
}
