// Shared UI flows for the nonconformances (NCR) journeys. Reuses the generic
// BaseSelect/e-sign/reload-tolerant helpers from fixtures/documents.js — they
// are not document-specific, just the project's only home for them so far.
import { expect } from '@playwright/test'
import { FIXTURES, USERS, AUTH, ESIGN_PIN } from './cast.js'
import { waitForSqlValue } from './db.js'
import { selectOption, selectFirstOption, clickWhenReady } from './documents.js'

/** Unique, greppable NC title for one test run. */
export function uniqueTitle(tag) {
  return `E2E NC ${tag} ${Date.now()}`
}

/**
 * Raise an NC from the create page: pick the workflow (screen 1), fill the
 * required fields (title, containment, classification, item), submit, and
 * confirm the auto-populated "Assign Step Reviewers" dialog. Create NC also
 * OPENS the NC (create-and-open, 2026-08-10) — the function ends on the new
 * NC's detail page with the workflow already running (UNDER_REVIEW).
 * Returns the title.
 */
/**
 * @param {object} [opts]
 * @param {string} [opts.severity]
 * @param {(page) => Promise<void>} [opts.beforeSubmit] runs on the completed
 *   create form, just before Submit. Inert by default.
 * @param {(page) => Promise<void>} [opts.onReviewerDialog] runs on the
 *   "Assign Step Reviewers" dialog, before Confirm. Inert by default. Both
 *   exist so the screenshot specs can capture those states without duplicating
 *   this flow.
 */
export async function raiseNc(page, title, { severity = null, beforeSubmit, onReviewerDialog } = {}) {
  await page.goto('/nonconformances/create')

  // Workflow-first wizard. With exactly ONE active NC workflow screen 1
  // auto-skips (2026-08-14) straight to the details form; with several
  // (other e2e projects create NC workflow templates in this shared tenant)
  // the card gallery shows and we click ours. Wait for EITHER outcome — a
  // fresh profile's first IDB bootstrap can take well over 15s under load.
  const workflowCard = page.getByRole('button', { name: `Select workflow ${FIXTURES.ncrWorkflowName}` })
  const titleInput = page.getByPlaceholder('Describe the nonconformance…')
  await expect(workflowCard.or(titleInput).first()).toBeVisible({ timeout: 45_000 })
  if (await workflowCard.isVisible().catch(() => false)) {
    await workflowCard.click()
  }

  // Screen 2 — the NC details form.
  await titleInput.fill(title)

  // Description — REQUIRED (2026-08-14). First rich-text editor in the
  // section; an empty editor emits '<p></p>' and fails validation.
  await page.locator('.create-nc-editor [contenteditable="true"]').nth(0).fill('E2E description: nonconformance details.')

  // Immediate containment action — REQUIRED, lives in Basic information
  // (2026-08-10). Second rich-text editor in the section (first is
  // Description); an empty editor emits '<p></p>' and fails validation.
  await page.locator('.create-nc-editor [contenteditable="true"]').nth(1).fill('E2E containment: segregated affected units.')

  // Pin Site/Department to the seeded pair the specs' counter assertions
  // expect (NC number prefix NC-HQ-QA). first-option is no longer stable —
  // other e2e projects accumulate sites (e.g. 'Main Site') in this tenant.
  await selectOption(page, 'Site', 'Primary Site')
  await selectOption(page, 'Department', 'Quality')
  await selectFirstOption(page, 'NC Type')
  await selectFirstOption(page, 'Detection source')
  if (severity) {
    await page.getByRole('radio', { name: severity }).click()
  }

  // Product & material — Item is REQUIRED (2026-08-10; no auto-fill by
  // design). The field label is 'Item' — 'Product' would anchor on the
  // progress-nav chip of the same name and drive the WRONG combobox.
  // Dismiss Detection source's panel first: the keyboard Enter selects but
  // can leave the popover OPEN (trace-verified), and the next click is then
  // consumed as its outside-click — Item's own panel would never open. A
  // neutral click (title input) closes it deterministically.
  await page.getByPlaceholder('Describe the nonconformance…').click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await selectOption(page, 'Item', 'E2E Widget 10mm')

  if (beforeSubmit) await beforeSubmit(page)

  await page.getByRole('button', { name: 'Create NC' }).click()

  // "Assign Step Reviewers" dialog — the seeded steps each have exactly one
  // role member, so both pickers auto-select once IDB resolves; just wait for
  // Confirm to enable (gated on the first/required step having a pick).
  // Anchor on content, not role=dialog — headlessui's dialog wrapper reports
  // zero-size/hidden to Playwright even while its content is visible.
  await expect(page.getByText('Assign task to user for each workflow step before submitting.')).toBeVisible({
    timeout: 15_000,
  })
  const confirmBtn = page.getByRole('button', { name: 'Confirm' })
  await expect(confirmBtn).toBeEnabled({ timeout: 15_000 })
  if (onReviewerDialog) await onReviewerDialog(page)
  await confirmBtn.click()

  // The create POST has been observed taking ~20s under repeated test load
  // (still 200s, just slow — mirrors the worker-queue backpressure documented
  // in documents.js); give it generous headroom rather than a flaky 20s cap.
  await expect(page).toHaveURL(/\/nonconformances\/(?!create)[0-9a-f-]{36}/, { timeout: 45_000 })
  await expect(page.getByText(title).first()).toBeVisible()
  return title
}

// (openNc removed 2026-08-10: Create NC now opens the workflow in the same
// action — raiseNc already ends UNDER_REVIEW. The detail page's Open NC
// button still exists for NCs that arrive as drafts, e.g. QC-lot spawns.)

/**
 * Reviewer (step 1, ACTION, no e-sign) completes their task — a direct
 * Mark-Complete click (no dialog: no e-signature, no form schema).
 */
export async function completeReviewerStep(browser, ncId) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'Nonconformance' AND entity_id = '${ncId}'
        AND assigned_to = '${USERS.reviewer.id}' AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
    { timeoutMs: 45_000, label: 'reviewer task assigned' },
  )
  const ctx = await browser.newContext({ storageState: AUTH.reviewer })
  const page = await ctx.newPage()
  await page.goto(`/nonconformances/${ncId}`, { waitUntil: 'domcontentloaded' })
  await clickWhenReady(page, page.getByRole('button', { name: 'Mark Complete' }))
  await ctx.close()
}

/**
 * Approver (step 2, APPROVAL, e-sign) approves — Approve → PIN dialog → Sign.
 * Completing this step finishes the workflow (all steps done).
 */
export async function completeApproverStep(browser, ncId) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'Nonconformance' AND entity_id = '${ncId}'
        AND assigned_to = '${USERS.approver.id}' AND deleted_at IS NULL AND status_id NOT IN ('CANCELLED')`,
    { timeoutMs: 45_000, label: 'approver task created' },
  )
  const ctx = await browser.newContext({ storageState: AUTH.approver })
  const page = await ctx.newPage()
  await page.goto(`/nonconformances/${ncId}`, { waitUntil: 'domcontentloaded' })

  // getByRole name matching is substring by default — "Approve" also matches
  // the "AA Adam Approver User" profile-menu button in the header (DOM order
  // put it first), so an un-anchored match silently clicked the wrong element
  // (no dialog, no error, no state change). exact:true is required here.
  await clickWhenReady(page, page.getByRole('button', { name: 'Approve', exact: true }))
  const pin = page.getByPlaceholder('Enter your e-signature PIN')
  await expect(pin).toBeVisible({ timeout: 15_000 })
  await pin.fill(ESIGN_PIN)
  await page.getByRole('button', { name: 'Sign' }).click()
  await ctx.close()
}

/**
 * Fill the Disposition card (owner, inline autosave) — disposition type,
 * notes, optional cost. Waits for each autosave to land before returning
 * (deep-watch debounce), so a following markComplete sees the persisted gate.
 */
export async function fillDisposition(page, ncId, { disposition, notes, costOfNc, capaRequired } = {}) {
  const quote = (s) => `'${String(s).replace(/'/g, "''")}'`
  if (disposition) {
    await selectOption(page, 'Disposition', disposition)
    await waitForSqlValue(
      `SELECT count(*) FROM nonconformances nc JOIN nc_disposition_types t ON t.id = nc.disposition_type_id
        WHERE nc.id = '${ncId}' AND t.name = ${quote(disposition)}`,
      { timeoutMs: 15_000, label: 'disposition persisted' },
    )
  }
  if (capaRequired !== undefined) {
    // exact:true — "No" is a substring of the "Notify (cc)" section-header
    // button (same class of bug as "Approve"/"Sign" above).
    await page.getByRole('button', { name: capaRequired ? 'Yes' : 'No', exact: true }).click()
  }
  if (notes) {
    await page.getByPlaceholder('Justify your disposition decision and CAPA choice…').fill(notes)
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await waitForSqlValue(
      `SELECT count(*) FROM nonconformances WHERE id = '${ncId}' AND disposition_notes LIKE '%${notes.slice(0, 20)}%'`,
      { timeoutMs: 15_000, label: 'disposition notes persisted' },
    )
  }
  if (costOfNc != null) {
    await page.getByRole('button', { name: 'Edit cost of NC' }).click()
    await page.locator('input[type="number"]').last().fill(String(costOfNc))
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await waitForSqlValue(
      `SELECT count(*) FROM nonconformances WHERE id = '${ncId}' AND cost_of_nc = ${costOfNc}`,
      { timeoutMs: 15_000, label: 'cost of NC persisted' },
    )
  }
}

/**
 * Owner clicks "Approve & Close", confirms the dialog, and e-signs. Assumes
 * every close gate is already satisfied (steps done, disposition + notes set,
 * cost set if the disposition tracks cost, CAPA linked if required).
 */
export async function approveAndClose(page, { comments = '' } = {}) {
  const btn = page.getByRole('button', { name: 'Approve & Close' })
  await expect(btn).toBeEnabled({ timeout: 15_000 })
  await btn.click()
  // Anchor on the dialog title text (role=dialog reports hidden — see raiseNc).
  await expect(page.getByText('Approve and Close', { exact: true })).toBeVisible({ timeout: 10_000 })
  if (comments) {
    await page.getByRole('textbox').last().fill(comments)
  }
  await page.getByRole('button', { name: 'Sign & Close' }).click()
  const pin = page.getByPlaceholder('Enter your e-signature PIN')
  await expect(pin).toBeVisible({ timeout: 10_000 })
  // exact:true — "Sign" is a substring of "Sign & Close", which may still be
  // in the DOM under the dialog overlay.
  const signBtn = page.getByRole('button', { name: 'Sign', exact: true })
  // Ordinary async UI timing (not the focus-trap bug — only one dialog is
  // open now): retry the fill until Sign actually enables.
  await expect(async () => {
    await pin.fill(ESIGN_PIN)
    await expect(signBtn).toBeEnabled({ timeout: 3_000 })
  }).toPass({ timeout: 15_000 })
  await signBtn.click()
}

/** Read the "Approve & Close" button's disabled-reason tooltip (title attr). */
export async function markCompleteBlockedReason(page) {
  const btn = page.getByRole('button', { name: 'Approve & Close' })
  return btn.getAttribute('title')
}

/**
 * Fire the real markComplete endpoint and assert the SERVER rejects it 409
 * with the expected gate message.
 *
 * The tooltip above only reflects the frontend computed, which merely *disables*
 * the button. The same 5 gates are enforced independently in the controller
 * (backend/api/controllers/nonconformances.js markNcComplete) — that's the half
 * that actually stops a direct API caller, and it has its own wording (e.g.
 * "Disposition is required…" vs the UI's "Pick a Disposition…").
 *
 * Signed with the REAL PIN deliberately: if a gate were ever dropped, the call
 * would 200 and CLOSE the NC, failing this assertion loudly — rather than being
 * masked by an "Invalid PIN" 400 that still looks like a rejection. Safe because
 * every gate runs before verifyAndSign, so a rejected call never reaches the PIN
 * attempt counter (no lockout risk).
 */
export async function expectMarkCompleteRejected(page, ncId, expectedMessage) {
  const res = await page.request.post(`/api/v1/services/nonconformances/${ncId}/markComplete`, {
    data: { method: 'PIN', token: ESIGN_PIN, provider: null, comments: 'E2E gate probe' },
  })
  expect(res.status(), `server must reject with 409: ${expectedMessage}`).toBe(409)
  const body = await res.json().catch(() => null)
  expect(body?.error?.message ?? '', 'server gate message').toMatch(expectedMessage)
}

/** Owner converts an UNDER_REVIEW NC to supplier-facing. */
export async function convertToSupplierFacing(page, supplierName) {
  // Priority 20 — below the DetailActionBar's inline top-2, so it lives in the
  // "More actions" overflow menu, not as an inline button.
  await page.getByRole('button', { name: /more actions/i }).click()
  await page
    .getByRole('menuitem', { name: /convert to supplier-facing/i })
    .or(page.getByRole('button', { name: /convert to supplier-facing/i }))
    .first()
    .click()
  // Anchor on the dialog title text (role=dialog reports hidden — see raiseNc).
  await expect(page.getByText('Convert to Supplier-Facing NC', { exact: true })).toBeVisible({
    timeout: 10_000,
  })
  // This dev DB has 15+ unrelated pre-existing suppliers, so the Supplier
  // combobox's listbox is long enough to risk virtualization/scroll not
  // rendering our option — type into the (searchable-by-default) search box
  // to filter down to just this one before selecting it.
  const supplierCombo = page
    .getByText('Supplier', { exact: true })
    .first()
    .locator('xpath=following::*[@role="combobox"][1]')
  await supplierCombo.click()
  await page.getByPlaceholder('Search…').fill(supplierName)
  await page.getByRole('listbox').getByRole('option', { name: supplierName, exact: true }).first().click()
  await page.getByRole('button', { name: 'Convert & reassign' }).click()
}
