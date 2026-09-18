// Shared UI flows for the Change Request (CR) journeys. Reuses the generic
// BaseSelect/e-sign/reload-tolerant helpers from fixtures/documents.js — they
// are not document-specific, just the project's only home for them so far.
import { expect } from '@playwright/test'
import { FIXTURES, USERS, AUTH, ESIGN_PIN } from './cast.js'
import { waitForSqlValue, sqlValue } from './db.js'
import { selectFirstOption, expectStatusEventually, clickWhenReady } from './documents.js'

/** Unique, greppable CR title for one test run. */
export function uniqueTitle(tag) {
  return `E2E CR ${tag} ${Date.now()}`
}

/**
 * Create a Change Request from the create page → DRAFT detail page.
 *
 * Unlike NCR's raiseNc / CAPA's createCapa there is NO reviewer-picker dialog
 * on submit: the CR create form ends at "Create Draft", and reviewers are
 * assigned afterwards on the detail page's ChangeRequestWorkflowDraftPreview
 * (see assignDraftReviewers). Returns the title.
 */
export async function createCr(page, title, { priority = null } = {}) {
  await page.goto('/change-requests/create')

  // Workflow-first wizard (2026-08-14). With exactly ONE active
  // CHANGE_CONTROL workflow screen 1 auto-skips straight to the details
  // form; with several (other e2e projects can create CC templates in this
  // shared tenant) the card gallery shows and we click ours. Wait for
  // EITHER outcome.
  const workflowCard = page.getByRole('button', {
    name: `Select workflow ${FIXTURES.crWorkflowName}`,
  })
  const titleInput = page.getByPlaceholder('Short summary of the change')
  await expect(workflowCard.or(titleInput).first()).toBeVisible({ timeout: 45_000 })
  if (await workflowCard.isVisible().catch(() => false)) {
    await workflowCard.click()
  }

  await titleInput.fill(title)

  await selectFirstOption(page, 'Change Type')
  await selectFirstOption(page, 'Site')
  await selectFirstOption(page, 'Department')
  if (priority) {
    await selectOptionInSection(page, '#cr-classification', 'Priority', priority)
  }

  await page.getByRole('button', { name: 'Create Draft' }).click()
  await expect(page).toHaveURL(/\/change-requests\/(?!create)[0-9a-f-]{36}/, { timeout: 45_000 })
  await expect(page.getByText(title).first()).toBeVisible()
  return title
}

/** Pick an option by visible text from a labelled select inside a given section. */
async function selectOptionInSection(page, sectionSelector, fieldLabel, optionText) {
  const combo = page
    .locator(sectionSelector)
    .getByText(fieldLabel, { exact: true })
    .first()
    .locator('xpath=following::*[@role="combobox"][1]')
  await combo.click()
  await page.getByRole('listbox').getByRole('option', { name: optionText, exact: true }).first().click()
}

/**
 * Wait for the DRAFT preview's per-step reviewer pickers to populate
 * `pending_reviewers`. Each seeded step's role has exactly one member and the
 * pickers are `required`, so BaseSelect auto-fills them — this just barriers on
 * the resulting save so a following Submit consumes a complete set of picks.
 */
export async function assignDraftReviewers(page, crId, { expectedSteps = 3 } = {}) {
  await page.goto(`/change-requests/${crId}`)
  // The pickers only render once the workflow template steps resolve from IDB.
  await expect(page.getByText('Approval Workflow Plan')).toBeVisible({ timeout: 20_000 })

  // jsonb key count — one key per assigned step.
  await waitForSqlValue(
    `SELECT (SELECT count(*) FROM jsonb_object_keys(pending_reviewers)) >= ${expectedSteps}
       FROM change_requests WHERE id = '${crId}'`,
    { timeoutMs: 30_000, label: `pending_reviewers has ${expectedSteps} step picks` },
  )
}

/** Owner opens a DRAFT CR (action → confirm dialog → submitForReview). */
export async function submitCrForApproval(page, crId) {
  await page.goto(`/change-requests/${crId}`)
  await clickWhenReady(page, page.getByRole('button', { name: 'Open Change Request' }))
  // Anchor on the dialog heading — "Open Change Request" also matches the
  // action-bar button that opened it and the dialog's own footer button.
  await expect(page.getByRole('heading', { name: 'Open Change Request' })).toBeVisible({
    timeout: 10_000,
  })
  await page.getByRole('button', { name: 'Open Change Request' }).last().click()
  // Unified statuses: the active state chip reads Open.
  await expectStatusEventually(page, /^Open$/)
}

/**
 * Reviewer (step 1 "Impact Review", ACTION, no e-sign, no form schema)
 * completes their task — a direct Mark-Complete click.
 *
 * The seeded step sets require_comments, but that does NOT gate Mark Complete:
 * WorkflowStep.vue's completeDisabled only blocks on unfinished child sub-tasks
 * (`childrenBlock`), and with no e-signature and no form schema the click posts
 * COMPLETE_AND_ADVANCE straight through with no dialog.
 */
export async function completeReviewerStep(browser, crId) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'ChangeRequest' AND entity_id = '${crId}'
        AND assigned_to = '${USERS.reviewer.id}' AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
    { timeoutMs: 45_000, label: 'reviewer task assigned' },
  )
  const ctx = await browser.newContext({ storageState: AUTH.reviewer })
  const page = await ctx.newPage()
  await page.goto(`/change-requests/${crId}`, { waitUntil: 'domcontentloaded' })
  await clickWhenReady(page, page.getByRole('button', { name: 'Mark Complete' }))
  // Barrier on the step actually closing before tearing the context down —
  // otherwise the in-flight POST can be cancelled with the browser context.
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'ChangeRequest' AND entity_id = '${crId}'
        AND assigned_to = '${USERS.reviewer.id}' AND status_id NOT IN ('ASSIGNED','FORM_SUBMITTED')`,
    { timeoutMs: 30_000, label: 'reviewer task completed' },
  )
  await ctx.close()
}

/**
 * Approver (step 2 "Change Approval", APPROVAL + e-sign) approves —
 * Approve → PIN dialog → Sign.
 */
export async function completeApproverStep(browser, crId) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'ChangeRequest' AND entity_id = '${crId}'
        AND assigned_to = '${USERS.approver.id}' AND deleted_at IS NULL AND status_id NOT IN ('CANCELLED')`,
    { timeoutMs: 45_000, label: 'approver task created' },
  )
  const ctx = await browser.newContext({ storageState: AUTH.approver })
  const page = await ctx.newPage()
  await page.goto(`/change-requests/${crId}`, { waitUntil: 'domcontentloaded' })

  // exact:true — "Approve" also matches the profile-menu button in the header
  // (same class of bug documented in fixtures/nonconformances.js).
  const approveBtn = page.getByRole('button', { name: 'Approve', exact: true })
  await clickWhenReady(page, approveBtn)
  const pin = page.getByPlaceholder('Enter your e-signature PIN')
  // Under load the first Approve click can land before the step's task has
  // hydrated, so onCompleteAndAdvanceClick's canActOnStep guard drops it and no
  // dialog opens. Re-click only while the PIN dialog is absent.
  await expect(async () => {
    if (!(await pin.isVisible().catch(() => false))) {
      await approveBtn.click({ timeout: 5_000 }).catch(() => {})
    }
    await expect(pin).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 40_000 })
  await pin.fill(ESIGN_PIN)
  await page.getByRole('button', { name: 'Sign', exact: true }).click()
  // Barrier on the approval landing before tearing the context down — otherwise
  // the in-flight POST can be cancelled with the browser context.
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'ChangeRequest' AND entity_id = '${crId}'
        AND assigned_to = '${USERS.approver.id}' AND status_id NOT IN ('ASSIGNED','FORM_SUBMITTED')`,
    { timeoutMs: 30_000, label: 'approver task completed' },
  )
  await ctx.close()
}

/**
 * Owner completes step 3 ("Implementation", ACTION, allow_child_steps) — the
 * last root step, so finishing it fires the CR handler's onComplete and moves
 * the CR to APPROVED.
 */
export async function completeImplementationStep(page, crId) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'ChangeRequest' AND entity_id = '${crId}'
        AND assigned_to = '${USERS.author.id}' AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
    { timeoutMs: 45_000, label: 'implementation task assigned' },
  )
  await page.goto(`/change-requests/${crId}`, { waitUntil: 'domcontentloaded' })
  await clickWhenReady(page, page.getByRole('button', { name: 'Mark Complete' }))
}

/**
 * A button on the record's own action bar (Submit for Approval / Close /
 * Cancel / …).
 *
 * Disambiguation is required: every rendered workflow step ALSO exposes its own
 * "Cancel" (cancel-this-step) button, so a bare
 * `getByRole('button', {name:'Cancel'})` is a strict-mode violation once the
 * workflow section renders — and only passes while the steps are still loading.
 *
 * first() is the action bar: this detail layout renders its header (and
 * DetailActionBar within it) above the workflow section, so the record-level
 * action always precedes the per-step ones in DOM order. Note the bar is NOT
 * teleported to #main-header-actions on this page — the standard/full detail
 * variant keeps it inline in the record card.
 */
export function actionBarButton(page, name) {
  return page.getByRole('button', { name, exact: true }).first()
}

/**
 * Owner closes an APPROVED CR: Close → notes → Sign & Close → PIN → Sign.
 * The page navigates back to the list on success.
 */
export async function closeCr(page, { comments = '' } = {}) {
  await actionBarButton(page, 'Close').click()
  await expect(page.getByRole('heading', { name: 'Close Change Request' })).toBeVisible({
    timeout: 10_000,
  })
  if (comments) {
    await page.getByPlaceholder('Summary of the change outcome, lessons learned, etc.').fill(comments)
  }
  await page.getByRole('button', { name: 'Sign & Close' }).click()
  await signEsignDialog(page)
}

/** Owner cancels a non-terminal CR: Cancel → reason → Sign & Cancel → PIN → Sign. */
export async function cancelCr(page, { reason = 'E2E cancel — change no longer required.' } = {}) {
  await actionBarButton(page, 'Cancel').click()
  await expect(page.getByRole('heading', { name: 'Cancel Change Request' })).toBeVisible({
    timeout: 10_000,
  })
  await page.getByPlaceholder('Why is this Change Request being cancelled?').fill(reason)
  await page.getByRole('button', { name: 'Sign & Cancel' }).click()
  await signEsignDialog(page)
}

/**
 * Fill + submit the shared WorkflowInstanceEsignAuthDialog.
 * exact:true — "Sign" is a substring of the "Sign & Close"/"Sign & Cancel"
 * button that opened it, which may still be in the DOM under the overlay.
 */
async function signEsignDialog(page) {
  const pin = page.getByPlaceholder('Enter your e-signature PIN')
  await expect(pin).toBeVisible({ timeout: 10_000 })
  const signBtn = page.getByRole('button', { name: 'Sign', exact: true })
  await expect(async () => {
    await pin.fill(ESIGN_PIN)
    await expect(signBtn).toBeEnabled({ timeout: 3_000 })
  }).toPass({ timeout: 15_000 })
  await signBtn.click()
}

/** The id of a CR's workflow instance step by its template step name. */
export function stepIdByName(crId, stepName) {
  return sqlValue(
    `SELECT wis.id FROM workflow_instance_steps wis
       JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
       LEFT JOIN workflow_steps ws ON ws.id = wis.step_id
      WHERE wi.resource_type = 'ChangeRequest' AND wi.resource_id = '${crId}'
        AND COALESCE(ws.name, wis.name) = '${stepName}'
      ORDER BY wis.created_at DESC LIMIT 1`,
  )
}

/**
 * Fire the real close endpoint and assert the SERVER rejects it 409 with the
 * expected gate message — the controller enforces the status gate
 * independently of the UI's disabled button, so a direct API caller isn't
 * stopped by the frontend at all.
 */
export async function expectCloseRejected(page, crId, expectedMessage) {
  const res = await page.request.post(`/api/v1/services/changeRequests/${crId}/close`, {
    data: { comments: 'E2E gate probe', method: 'PIN', token: ESIGN_PIN, provider: null },
  })
  expect(res.status(), `server must reject with 409: ${expectedMessage}`).toBe(409)
  const body = await res.json().catch(() => null)
  expect(body?.error?.message ?? '', 'server gate message').toMatch(expectedMessage)
}
