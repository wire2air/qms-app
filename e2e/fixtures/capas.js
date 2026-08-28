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
 * ACTIVE CAPA workflow in E2ELAB is the implicit default).
 *
 * ~~There is NO reviewer dialog anymore (flow change 2026-08-12).~~ True for
 * six days. `5baf25fe` (2026-08-18) brought the per-step dialog BACK for NC
 * parity: `onSubmit` now calls `workflowPickerRef.submit()` and the picks land
 * in `capas.pending_reviewers`. The CAPA is still created as a DRAFT and the
 * workflow still starts on Start CAPA, where those picks show pre-filled and
 * remain editable — see `confirmStepReviewers` below.
 *
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

  // Fill, then PROVE the value stuck — same discipline as fixtures/esign.js.
  //
  // Clicking the workflow card swaps screen 1 for screen 2, and this fill lands
  // ~8ms later (per the trace). Playwright's stability check does not span a
  // Vue remount: the input it filled is replaced by the freshly-mounted one,
  // v-model never sees the value, and `fill()` reports success. PW-J2's second
  // test then reached Create CAPA with an EMPTY title and died three steps on,
  // waiting for a reviewer dialog that validation had already prevented.
  await expect(async () => {
    await titleInput.fill(title)
    await expect(titleInput).toHaveValue(title, { timeout: 1_000 })
  }).toPass({ timeout: 20_000 })

  // Problem Statement became REQUIRED on 2026-08-17 (`e16960dd` — "CAPA:
  // require the problem statement and closure comments"). It is a TipTap
  // rich-text editor, not an input, so `fill()` has nothing to fill: click into
  // the contenteditable and type.
  //
  // Missing this is what killed the whole project. Create CAPA stayed on
  // /capas/create behind "Please fix 1 issue before continuing", every journey
  // timed out on the same toHaveURL, and no `capas` row was written at all —
  // 11 of the 14 CAPA tests, one cause, for eleven days.
  const PROBLEM_TEXT = 'E2E problem statement — deviation observed during routine review.'
  const problem = page.locator('.create-capa-editor [contenteditable="true"]').first()
  await expect(problem).toBeVisible({ timeout: 15_000 })
  // Same remount hazard as the title above, and a contenteditable cannot be
  // asserted with toHaveValue — check its text instead.
  await expect(async () => {
    await problem.click()
    await page.keyboard.insertText(PROBLEM_TEXT)
    await expect(problem).toContainText(PROBLEM_TEXT, { timeout: 1_000 })
  }).toPass({ timeout: 20_000 })

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

  // Re-prove both required fields at SUBMIT time, not just at fill time.
  //
  // Asserting the value stuck immediately after filling is not enough: twice
  // now the form has reached Create CAPA with Title AND Problem Statement
  // empty while Site/Department/CAPA Type/Source — filled AFTER them — all
  // survived. So something in the workflow-wizard's screen-1→screen-2
  // transition wipes the two Basic-information fields a beat AFTER the
  // post-fill assertion has already passed. The mechanism is NOT pinned; what
  // is certain is the symptom, because the create page says it out loud:
  // "Please fix 2 issues before continuing — Title is required / Problem
  // Statement". Left unguarded it fails 30s later and three steps away, at a
  // reviewer dialog that validation had already prevented from opening.
  await expect(async () => {
    if ((await titleInput.inputValue()) !== title) await titleInput.fill(title)
    await expect(titleInput).toHaveValue(title, { timeout: 1_000 })
    if (!(await problem.innerText()).includes(PROBLEM_TEXT)) {
      await problem.click()
      await page.keyboard.insertText(PROBLEM_TEXT)
    }
    await expect(problem).toContainText(PROBLEM_TEXT, { timeout: 1_000 })
  }).toPass({ timeout: 20_000 })

  await page.getByRole('button', { name: 'Create CAPA' }).click()

  // Submit-time "Assign Step Reviewers" dialog (re-introduced 2026-08-18, NC
  // parity). The picks are parked in pending_reviewers; the CAPA is still
  // created as a DRAFT. EXPLICIT picks, not confirmStepReviewers' silent
  // first-candidate: the Reviewer role has two members and Riley sorts before
  // Rita, so the default would strand every downstream completeReviewerStep.
  await confirmReviewerDialog(page, reviewers)

  await expect(page).toHaveURL(/\/capas\/(?!create)[0-9a-f-]{36}/, { timeout: 45_000 })
  await expect(page.getByText(title).first()).toBeVisible()
  return title
}

/**
 * The submit-time per-step reviewer dialog (`WorkflowReviewerPickerDialog`,
 * back on the CAPA create form since `5baf25fe` 2026-08-18). Assigns a user to
 * every step and confirms. Only the first root step is `required`, but each
 * step left empty is a step the workflow will have to role-expand later, so
 * fill them all and keep the fixture deterministic.
 *
 * NOT the same dialog the documents suite drives. That one is titled "pick the
 * reviewer(s) for each step", its pickers are MULTI-selects (a click, never
 * Enter, and the panel has to be dismissed by hand) and it submits with
 * "Submit for Review". This one is "Assign Step Reviewers", its pickers are
 * single-select `UserSelectMenu`s that close themselves on pick, and it
 * submits with "Confirm".
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

export async function confirmStepReviewers(page) {
  // role=dialog reports hidden for the headlessui wrapper — wait on the body
  // copy, then use the dialog only as a scope. (fixtures/esign.js, documents/22 §2.1)
  await expect(
    page.getByText(/assign task to user for each workflow step/i),
  ).toBeVisible({ timeout: 30_000 })
  const dialog = page.getByRole('dialog').filter({ hasText: /assign task to user/i })

  const pickers = dialog.getByRole('combobox')
  const count = await pickers.count()
  for (let i = 0; i < count; i++) {
    const combo = pickers.nth(i)
    await combo.scrollIntoViewIfNeeded()
    // Scope to THIS combobox's own panel via aria-controls — a page-wide
    // getByRole('listbox') also matches a neighbouring step's panel.
    const listboxId = await combo.getAttribute('aria-controls')
    const listbox = listboxId ? page.locator(`[id="${listboxId}"]`) : page.getByRole('listbox')
    // Candidates load async (role expansion → IDB), and under load the popover
    // can miss the first click: retry both conditions together.
    await expect(async () => {
      if (!(await listbox.isVisible().catch(() => false))) await combo.click()
      await expect(listbox.getByRole('option').first()).toBeVisible({ timeout: 5_000 })
    }).toPass({ timeout: 30_000 })
    await listbox.getByRole('option').first().click()
    // Single-select: BaseSelect.selectOption closes the popover itself.
    await expect(listbox).toBeHidden({ timeout: 5_000 })
  }

  const confirm = dialog.getByRole('button', { name: 'Confirm', exact: true })
  await expect(confirm).toBeEnabled({ timeout: 10_000 })
  await confirm.click()
}

/**
 * Owner starts a DRAFT CAPA (Start CAPA → confirm dialog → submitForReview).
 *
 * ~~Open CAPA~~ — relabelled **Start CAPA** by `b33322be` (2026-08-17) when the
 * workflow rail card was shared across NC / CAPA / Change Control / Complaint.
 */
export async function openCapa(page, capaId) {
  await page.goto(`/capas/${capaId}`)
  await page.getByRole('button', { name: 'Start CAPA' }).first().click()
  // Anchor on the dialog body text (role=dialog reports hidden — see documents.js).
  await expect(page.getByText('Opening this CAPA starts the assigned workflow')).toBeVisible({
    timeout: 10_000,
  })
  await page.getByRole('button', { name: 'Start CAPA' }).last().click()

  // The DB is the source of truth for the transition; the chip follows by
  // sync-back. ~~/pending/i~~ — PENDING was retired by
  // 20260823100000-unified-record-statuses (capa/21 §1); the status is OPEN.
  await waitForSqlValue(
    `SELECT status_id FROM capas WHERE id = '${capaId}' AND status_id = 'OPEN'`,
    { timeoutMs: 45_000, label: 'CAPA OPEN' },
  )
  // Anchored, not /open/i: a loose match also hits "Opening this CAPA…" in the
  // dialog that may still be fading out, and "Open CAPAs" in the nav.
  await expectStatusEventually(page, /^open$/i)
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

/** Owner cancels an OPEN CAPA (the only status the UI's Cancel button targets). */
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
