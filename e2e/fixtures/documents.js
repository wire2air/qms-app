// Shared UI flows for the documents journeys. Selector strategy: BaseSelect
// renders role="combobox" → role="listbox"/"option", so selects are driven by
// (field label text) → first following combobox in document order.
import { expect } from '@playwright/test'
import { FIXTURES, USERS, AUTH, ESIGN_PIN } from './cast.js'
import { sqlValue, waitForSqlValue } from './db.js'

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
 *
 * Keys must go to the page (not `combo.press`, which refocuses the trigger
 * div — desktop's trigger has no keydown handler, so that's a silent no-op,
 * and refocusing away from the popover's autofocused search input can even
 * dismiss it). Wait for the listbox to actually have an option before
 * navigating, since options load async from IDB.
 */
async function selectFirstByKeyboard(combo) {
  const page = combo.page()
  // Scope to THIS select's own panel via aria-controls. A page-wide
  // getByRole('listbox') also matches the panel of the select filled a moment
  // ago while it is still animating shut — that reads as "already open", so the
  // click below gets skipped and the keystrokes land on nothing, silently
  // leaving the field unset (which then fails validation at submit).
  const listboxId = await combo.getAttribute('aria-controls')
  const listbox = listboxId ? page.locator(`[id="${listboxId}"]`) : page.getByRole('listbox')
  const firstOption = listbox.getByRole('option').first()
  // Re-click only when the panel isn't open — a click while it IS open would
  // toggle it shut. Under load the popover can miss the first click entirely,
  // and separately its options arrive async from IDB, so the two conditions
  // need distinct handling rather than one blind wait.
  await expect(async () => {
    if (!(await listbox.isVisible().catch(() => false))) {
      await combo.click()
    }
    await expect(firstOption).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 30_000 })
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
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

  // Applicability. This was a single "Site" combobox until the applicability
  // rework (5fa9164 "Applies to (site / sites / company-wide)" + 756fdd1 "single
  // Sites multi-select") relabelled it "Sites" and turned it into a checkbox +
  // multi-select. comboboxAfterLabel matches labels with `exact: true`, so the
  // stale "Site" stopped matching anything and every Documents journey died
  // right here on a 25s locator timeout — 13 specs, one root cause.
  //
  // Tick "All sites (company-wide)" rather than driving the multi-select: it
  // satisfies the field's required rule with one deterministic click, and a
  // multi-select panel does not auto-close, so picking an option leaves it open
  // over the Department field below. No Documents spec asserts on the resulting
  // site, so company-wide is a safe choice here.
  // BaseCheckbox renders the real <input> as `sr-only` behind a styled <span>,
  // so a normal check() is intercepted by that span. force:true targets the
  // input directly; the assertion below is what proves the click actually took.
  const allSites = page.getByLabel('All sites (company-wide)')
  await allSites.check({ force: true })
  await expect(allSites).toBeChecked()
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
  // The status chip flips via sync-back (REST action → audit → sync socket →
  // syncEngine → IDB), and that socket push can be missed in a churning headless
  // context. Reload to re-pull the authoritative version via delta-sync, then
  // assert — retry until the chip shows.
  await expectStatusEventually(page, /in review/i)
}

/**
 * Assert a status chip/text appears, tolerating sync-back lag: reloads the page
 * (delta-sync re-pulls the changed record) and retries until it shows. Use after
 * any REST lifecycle action whose result the UI reflects only via sync-back.
 */
export async function expectStatusEventually(page, pattern, { timeout = 40_000 } = {}) {
  await expect(async () => {
    await expect(page.getByText(pattern).first()).toBeVisible({ timeout: 3_000 }).catch(async () => {
      await page.reload()
      await expect(page.getByText(pattern).first()).toBeVisible({ timeout: 4_000 })
    })
  }).toPass({ timeout })
}

/** Navigate to a document, bounded and without waiting on the live sync socket. */
export async function gotoDoc(page, documentId) {
  await page.goto(`/documents/${documentId}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
}

/**
 * Click a control that appears a few seconds after a fresh load once the SPA
 * hydrates and the task syncs from IDB (e.g. a reviewer/approver Approve button).
 * Gives each load a *patient* window (the control reliably renders within it —
 * reloading sooner just resets the hydration clock and starves it), and only
 * reloads as a fallback if it never shows. Bounded, so it fails fast rather than
 * consuming the whole test budget.
 */
export async function clickWhenReady(page, locator, { perLoad = 20_000, reloads = 2 } = {}) {
  const target = locator.first()
  for (let attempt = 0; attempt <= reloads; attempt++) {
    try {
      await expect(target).toBeVisible({ timeout: perLoad })
      await target.click()
      return
    } catch (err) {
      if (attempt === reloads) throw err
      await page.reload({ waitUntil: 'domcontentloaded' })
    }
  }
}

/**
 * Reject the current DocumentVersion task (Reject button → "Reject Step" dialog →
 * required comment → confirm). The ACTION step (reviewer, step 1) is not e-signed,
 * so no PIN. Leaves the version REJECTED with the comment as reject_comment.
 */
export async function rejectCurrentTask(page, documentId, comment = 'E2E reject — please correct section 1.') {
  await page.goto(`/documents/${documentId}`)
  const rejectBtn = page.getByRole('button', { name: /^reject$/i }).first()
  await expect(rejectBtn).toBeVisible({ timeout: 20_000 })
  await rejectBtn.click()
  // Feedback dialog — the "Comment (required)" textarea identifies it.
  const commentBox = page.getByLabel('Comment (required)')
  await expect(commentBox).toBeVisible({ timeout: 10_000 })
  await commentBox.fill(comment)
  // Footer confirm is the second "Reject" (the first is the action-bar trigger).
  await page.getByRole('button', { name: /^reject$/i }).last().click()
}

/**
 * Cancel an in-review version (author only, ACTION step active) → back to DRAFT.
 * Handles the action living either inline or under the "More actions" overflow,
 * plus an optional confirm dialog.
 */
export async function cancelReview(page, documentId) {
  await page.goto(`/documents/${documentId}`)
  const inline = page.getByRole('button', { name: /cancel review/i })
  if (!(await inline.first().isVisible({ timeout: 3_000 }).catch(() => false))) {
    await page.getByRole('button', { name: /more actions/i }).click()
  }
  await page.getByRole('menuitem', { name: /cancel review/i })
    .or(page.getByRole('button', { name: /cancel review/i }))
    .first()
    .click()
  // Optional confirm dialog.
  const confirm = page.getByRole('button', { name: /^(cancel review|confirm|yes|proceed)$/i }).last()
  if (await confirm.isVisible({ timeout: 2_000 }).catch(() => false)) await confirm.click()
}

/**
 * Drive an IN_REVIEW version through the seeded 2-step workflow to EFFECTIVE:
 * reviewer completes the ACTION step (comment), approver approves the APPROVAL
 * step with an e-signature PIN. Uses fresh role contexts; asserts EFFECTIVE in DB.
 */
export async function driveToEffective(browser, docId, versionId) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances WHERE entity_id = '${versionId}'
       AND assigned_to = '${USERS.reviewer.id}' AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
    { timeoutMs: 45_000, label: 'reviewer task assigned' },
  )
  const reviewerCtx = await browser.newContext({ storageState: AUTH.reviewer })
  const reviewerPage = await reviewerCtx.newPage()
  await gotoDoc(reviewerPage, docId)
  // The reviewer's Approve action renders once the step-1 task syncs into this
  // context; reload-tolerant so a missed socket push doesn't stall the run.
  await clickWhenReady(reviewerPage, reviewerPage.getByRole('button', { name: /^approve$/i }))
  const reviewDialog = reviewerPage.getByRole('dialog').last()
  if (await reviewDialog.isVisible({ timeout: 4_000 }).catch(() => false)) {
    const box = reviewDialog.locator('textarea, [contenteditable="true"]').first()
    if (await box.isVisible().catch(() => false)) {
      await box.click()
      await reviewerPage.keyboard.type('Reviewed by E2E — accurate.')
    }
    await reviewDialog.getByRole('button', { name: /approve|complete|submit|confirm|advance/i }).last().click()
  }
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances ti WHERE ti.entity_id = '${versionId}'
       AND ti.assigned_to = '${USERS.approver.id}' AND ti.deleted_at IS NULL AND ti.status_id NOT IN ('CANCELLED')`,
    { timeoutMs: 45_000, label: 'approver task created' },
  )
  await reviewerCtx.close()

  const approverCtx = await browser.newContext({ storageState: AUTH.approver })
  const approverPage = await approverCtx.newPage()
  await gotoDoc(approverPage, docId)
  // The approver's Approve action renders only after the step-2 assignment syncs
  // into this context (the exact spot J5 stalled on before). Reload-tolerant.
  await clickWhenReady(approverPage, approverPage.getByRole('button', { name: /^approve$/i }))
  const pin = approverPage.getByPlaceholder('Enter your e-signature PIN')
  await expect(pin).toBeVisible({ timeout: 10_000 })
  await pin.fill(ESIGN_PIN)
  await approverPage.getByRole('button', { name: 'Sign' }).click()
  await waitForSqlValue(
    `SELECT status_id FROM document_versions WHERE id = '${versionId}' AND status_id = 'EFFECTIVE'`,
    // The APPROVED→EFFECTIVE transition is worker-driven (JOB-02 auto-effective);
    // under full-suite load the job queue (snapshots, notifications) backs up, so
    // allow generous headroom (well within the test budget).
    { timeoutMs: 150_000, label: 'version EFFECTIVE' },
  )
  await approverCtx.close()
}

/**
 * Create a new revision from the current (APPROVED/EFFECTIVE) version via the
 * "Create New Draft" → "Create New Revision" dialog. Fills the required change
 * reason + change type. Returns after the dialog closes.
 */
export async function createNewRevision(page, docId, { reason = 'E2E revision — updated per SOP-014 rev 4.', changeType = 'Minor' } = {}) {
  await gotoDoc(page, docId)
  // "Create New Draft" only appears once the latest version is APPROVED/EFFECTIVE.
  // After driveToEffective ran in other contexts, this page's IndexedDB can lag,
  // so wait (reload-tolerant) for the effective state before looking for it.
  await expectStatusEventually(page, /effective|approved/i)
  const inline = page.getByRole('button', { name: /create new draft/i })
  if (!(await inline.first().isVisible({ timeout: 3_000 }).catch(() => false))) {
    await page.getByRole('button', { name: /more actions/i }).click()
  }
  await page.getByRole('menuitem', { name: /create new draft/i })
    .or(page.getByRole('button', { name: /create new draft/i }))
    .first()
    .click()
  await expect(page.getByText('Create New Revision')).toBeVisible({ timeout: 10_000 })
  await page.getByPlaceholder(/New calibration interval/i).fill(reason)
  // The change-type control is a <button> whose accessible name is the label span
  // ("Minor") followed by its description span, so anchor at the start of the name
  // (a `^Minor$` match never resolves and the click would auto-wait to the cap).
  await page.getByRole('button', { name: new RegExp(`^${changeType}\\b`, 'i') }).click()
  await page.getByRole('button', { name: 'Create Revision' }).click()
  await expect(page.getByText('Create New Revision')).toBeHidden({ timeout: 15_000 })
}
