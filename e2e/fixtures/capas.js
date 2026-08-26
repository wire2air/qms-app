// Shared UI flows for the CAPA journeys. Reuses the generic BaseSelect/e-sign/
// reload-tolerant helpers from fixtures/documents.js — they are not
// document-specific, just the project's only home for them so far.
import { expect } from '@playwright/test'
import { AUTH, USERS, ESIGN_PIN } from './cast.js'
import { waitForSqlValue } from './db.js'
import { selectFirstOption, selectOption, expectStatusEventually, clickWhenReady } from './documents.js'

const CAPA_WORKFLOW_NAME = 'E2E CAPA Review & Approval'
/** Two consecutive Reviewer ACTION steps + approval — seeded for CAPA-J8/J9. */
export const GROUPED_CAPA_WORKFLOW_NAME = 'E2E CAPA Grouped Actions'
/** ACTION + deferred effectiveness DELAY step — seeded for CAPA-J4 (§31e). */
export const EFFECTIVENESS_CAPA_WORKFLOW_NAME = 'E2E CAPA Effectiveness Delay'

/** Unique, greppable CAPA title for one test run. */
export function uniqueTitle(tag) {
  return `E2E CAPA ${tag} ${Date.now()}`
}

/**
 * Create a CAPA from the create page: fill required Classification fields
 * and submit. The workflow is auto-selected (default template — the single
 * ACTIVE CAPA workflow in E2ELAB is the implicit default) and there is NO
 * reviewer dialog anymore (flow change 2026-08-12): the CAPA is created as
 * a DRAFT, reviewers are assigned on the detail page's draft plan, and the
 * workflow starts on Open CAPA (unpicked steps fall back to role expansion).
 * Ends on the new CAPA's detail page (DRAFT). Returns the title.
 */
export async function createCapa(page, title, { priority = null, ...hooks } = {}) {
  await page.goto('/capas/create')
  return fillCapaCreateForm(page, title, { priority, ...hooks })
}

/**
 * The create-CAPA form fill + submit, WITHOUT the navigation to /capas/create.
 * Split out of `createCapa` so a caller that reached the create page another way
 * can reuse it — the audits suite arrives via the finding deep link
 * (`/capas/create?findingId=…`), and re-navigating would drop the query param
 * that makes the new CAPA self-link back to the finding.
 */
/**
 * @param {object} [opts]
 * @param {string} [opts.priority]
 * @param {string} [opts.workflowName] pick a specific workflow card on the
 *   wizard's first screen (default: the standard two-step E2E workflow). §31
 *   seeded a second ACTIVE CAPA workflow, so the gallery always shows now.
 * @param {string} [opts.siteName] pick a specific Site by its visible name
 *   (default: first option). CAPA-J9's out-of-site case needs Secondary Site.
 * @param {string[]} [opts.reviewers] user display names to pick in the submit
 *   time "Assign Step Reviewers" dialog, by step order. Default: Rita on step
 *   1 only. Explicit because the Reviewer role has TWO members since §31
 *   (Riley sorts before Rita), so the dialog's silent first-candidate default
 *   would route step 1 to the wrong persona and strand every downstream
 *   `completeReviewerStep` wait. Unpicked steps fall back to role expansion
 *   at Open CAPA.
 * @param {(page) => Promise<void>} [opts.beforeSubmit] runs on the completed
 *   create form, just before Create CAPA. Inert by default. Exists so the
 *   screenshot specs can capture that state without duplicating this flow.
 */
export async function fillCapaCreateForm(
  page,
  title,
  {
    priority = null,
    workflowName = CAPA_WORKFLOW_NAME,
    siteName = null,
    reviewers = [USERS.reviewer.name],
    beforeSubmit,
  } = {},
) {
  // Workflow-first wizard (2026-08-14). With exactly ONE active CAPA
  // workflow screen 1 auto-skips straight to the details form; with several
  // (§31 seeds a second, and other e2e projects can create more) the card
  // gallery shows and we click ours. Wait for EITHER outcome.
  const workflowCard = page.getByRole('button', { name: `Select workflow ${workflowName}` })
  const titleInput = page.getByPlaceholder('Describe the CAPA…')
  await expect(workflowCard.or(titleInput).first()).toBeVisible({ timeout: 45_000 })
  if (await workflowCard.isVisible().catch(() => false)) {
    await workflowCard.click()
  }

  await titleInput.fill(title)

  // Problem Statement became REQUIRED on the create form (2026-08-17). It is
  // a TipTap rich-text field: no placeholder attribute in the DOM — the hint
  // is CSS-rendered from data-placeholder, so click that node and type.
  const problem = page.locator(
    '[data-placeholder="What is the problem this CAPA addresses?…"]',
  )
  await problem.click()
  await page.keyboard.type(`${title} — seeded problem statement.`)

  if (siteName) {
    await selectOption(page, 'Site', siteName)
  } else {
    await selectFirstOption(page, 'Site')
  }
  await selectFirstOption(page, 'Department')
  await selectFirstOption(page, 'CAPA Type')
  await selectFirstOption(page, 'Source')
  if (priority) {
    // Priority is a SegmentedControl — WAI-ARIA radiogroup, options are
    // role="radio", not role="button".
    await page.getByRole('radio', { name: priority, exact: true }).click()
  }

  if (beforeSubmit) await beforeSubmit(page)

  await page.getByRole('button', { name: 'Create CAPA' }).click()

  // Submit-time "Assign Step Reviewers" dialog (re-introduced 2026-08-18, NC
  // parity). The picks are parked in pending_reviewers; the CAPA is still
  // created as a DRAFT. This dialog is what silently broke every journey that
  // called createCapa and then waited for the detail URL.
  await confirmReviewerDialog(page, reviewers)

  await expect(page).toHaveURL(/\/capas\/(?!create)[0-9a-f-]{36}/, { timeout: 45_000 })
  await expect(page.getByText(title).first()).toBeVisible()
  return title
}

/**
 * Drive the submit-time "Assign Step Reviewers" dialog: pick `reviewers[i]`
 * (a user display name) on the i-th step row, then Confirm. Entries that are
 * null/undefined leave that step on whatever the dialog defaulted (or empty —
 * role expansion covers it at Open).
 */
export async function confirmReviewerDialog(page, reviewers = []) {
  await expect(page.getByText('Assign Step Reviewers')).toBeVisible({ timeout: 15_000 })
  // Each WorkflowStepReviewerSelect row carries one combobox, in step order.
  // The options list is teleported to the body, so open a row's combobox and
  // pick from the page-level listbox. Rows RE-RENDER as each step's candidate
  // pool arrives from IDB, so a single click can land mid re-render and report
  // "element is not stable" — click-until-options, the selectFirstByKeyboard
  // pattern.
  const body = page
    .locator('div')
    .filter({ has: page.getByText('Assign task to user for each workflow step') })
    .last()
  for (let i = 0; i < reviewers.length; i += 1) {
    const name = reviewers[i]
    if (!name) continue
    const combo = body.getByRole('combobox').nth(i)
    const option = page.getByRole('listbox').getByRole('option', { name }).first()
    // The CLICK lives inside the retry too: the listbox re-renders as user
    // rows stream in from IDB, and an option that was visible a tick ago can
    // be mid-replacement at click time ("element is not stable").
    await expect(async () => {
      if (!(await option.isVisible().catch(() => false))) {
        await combo.click({ timeout: 3_000 })
      }
      await option.click({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
  }
  await page.getByRole('button', { name: 'Confirm' }).click()
}

/** Owner starts a DRAFT CAPA (Start CAPA → confirm dialog → submitForReview).
 *  The action was relabelled Open → Start when NC gained auto-open and CAPA
 *  kept the explicit draft step (workflow-selection UX, 2026-08-12). */
export async function openCapa(page, capaId) {
  await page.goto(`/capas/${capaId}`)
  await page.getByRole('button', { name: 'Start CAPA' }).click()
  // Anchor on the dialog title text (role=dialog reports hidden — see documents.js).
  await expect(page.getByText('Opening this CAPA starts the assigned workflow')).toBeVisible({
    timeout: 10_000,
  })
  await page.getByRole('button', { name: 'Start CAPA' }).last().click()
  // The record status chip — unified statuses call the active state Open.
  // (/pending/i would still match the step badges and pass for the wrong
  // reason.)
  await expectStatusEventually(page, /^Open$/)
}

/**
 * Reviewer (step 1, ACTION, no e-sign) completes their task — a direct
 * Mark-Complete click (no dialog: no e-signature, no form schema).
 */
export async function completeReviewerStep(browser, capaId) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'Capa' AND entity_id = '${capaId}'
        AND assigned_to = '${USERS.reviewer.id}' AND status_id IN ('ASSIGNED','FORM_SUBMITTED')`,
    { timeoutMs: 45_000, label: 'reviewer task assigned' },
  )
  const ctx = await browser.newContext({ storageState: AUTH.reviewer })
  const page = await ctx.newPage()
  await page.goto(`/capas/${capaId}`, { waitUntil: 'domcontentloaded' })
  await clickWhenReady(page, page.getByRole('button', { name: 'Mark Complete' }))
  await ctx.close()
}

/**
 * Approver (step 2, APPROVAL, e-sign) approves — Approve → PIN dialog → Sign.
 * Completing this step finishes the workflow (all steps done).
 */
export async function completeApproverStep(browser, capaId) {
  await waitForSqlValue(
    `SELECT count(*) FROM task_instances
      WHERE entity_type = 'Capa' AND entity_id = '${capaId}'
        AND assigned_to = '${USERS.approver.id}' AND deleted_at IS NULL AND status_id NOT IN ('CANCELLED')`,
    { timeoutMs: 45_000, label: 'approver task created' },
  )
  const ctx = await browser.newContext({ storageState: AUTH.approver })
  const page = await ctx.newPage()
  await page.goto(`/capas/${capaId}`, { waitUntil: 'domcontentloaded' })

  // exact:true — "Approve" also matches the profile-menu button in the header
  // (same class of bug documented in fixtures/nonconformances.js).
  await clickWhenReady(page, page.getByRole('button', { name: 'Approve', exact: true }))
  const pin = page.getByPlaceholder('Enter your e-signature PIN')
  await expect(pin).toBeVisible({ timeout: 15_000 })
  await pin.fill(ESIGN_PIN)
  await page.getByRole('button', { name: 'Sign' }).click()
  await ctx.close()
}

/**
 * Owner closes an OPEN CAPA with every workflow step already terminal.
 * The effectiveness-check date left this dialog on 2026-08-18 — the
 * workflow's DELAY step owns scheduling now — so the only gate a normal UI
 * flow can hit is "workflow steps still open". Closure comments are required.
 */
export async function closeCapa(page, { comments = 'E2E close — verified.' } = {}) {
  await page.getByRole('button', { name: 'Close CAPA' }).click()
  // "Close CAPA" also matches the action-bar button itself — anchor on the
  // dialog heading specifically.
  await expect(page.getByRole('heading', { name: 'Close CAPA' })).toBeVisible({ timeout: 10_000 })
  await page.getByPlaceholder('Summary of the corrective action and verification of completion').fill(comments)
  const signBtn = page.getByRole('button', { name: 'Sign & Close CAPA' })
  await expect(signBtn).toBeEnabled({ timeout: 15_000 })
  await signBtn.click()
  const pin = page.getByPlaceholder('Enter your e-signature PIN')
  await expect(pin).toBeVisible({ timeout: 10_000 })
  // exact:true — "Sign" is a substring of "Sign & Close CAPA", which may
  // still be in the DOM under the dialog overlay.
  const signPinBtn = page.getByRole('button', { name: 'Sign', exact: true })
  await expect(async () => {
    await pin.fill(ESIGN_PIN)
    await expect(signPinBtn).toBeEnabled({ timeout: 3_000 })
  }).toPass({ timeout: 15_000 })
  await signPinBtn.click()
}

/** Owner cancels a PENDING CAPA (the only status the UI's Cancel button targets). */
export async function cancelCapa(page, { reason = 'E2E cancel — no longer needed.' } = {}) {
  await page.getByRole('button', { name: 'Cancel CAPA' }).click()
  // Anchor on the dialog heading — "Cancel CAPA" also matches the
  // action-bar button that triggered it.
  await expect(page.getByRole('heading', { name: 'Cancel CAPA' })).toBeVisible({ timeout: 10_000 })
  await page.getByPlaceholder('Why is this CAPA being cancelled?').fill(reason)
  await page.getByRole('button', { name: 'Sign & Cancel CAPA' }).click()
  const pin = page.getByPlaceholder('Enter your e-signature PIN')
  await expect(pin).toBeVisible({ timeout: 10_000 })
  const signPinBtn = page.getByRole('button', { name: 'Sign', exact: true })
  await expect(async () => {
    await pin.fill(ESIGN_PIN)
    await expect(signPinBtn).toBeEnabled({ timeout: 3_000 })
  }).toPass({ timeout: 15_000 })
  await signPinBtn.click()
}

/** Read the "Close CAPA" action-bar button's disabled-reason tooltip (title attr). */
export async function closeBlockedReason(page) {
  const btn = page.getByRole('button', { name: 'Close CAPA' })
  return btn.getAttribute('title')
}

/**
 * Fire the real close endpoint and assert the SERVER rejects it 409 with the
 * expected gate message — the controller enforces the open-steps gate
 * independently of the UI's disabled button, so a direct API caller isn't
 * stopped by the frontend at all.
 */
export async function expectCloseRejected(page, capaId, expectedMessage) {
  const res = await page.request.post(`/api/v1/services/capas/${capaId}/close`, {
    data: {
      effectivenessCheckAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      comments: 'E2E gate probe',
      method: 'PIN',
      token: ESIGN_PIN,
      provider: null,
    },
  })
  expect(res.status(), `server must reject with 409: ${expectedMessage}`).toBe(409)
  const body = await res.json().catch(() => null)
  expect(body?.error?.message ?? '', 'server gate message').toMatch(expectedMessage)
}
