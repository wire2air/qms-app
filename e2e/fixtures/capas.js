// Shared UI flows for the CAPA journeys. Reuses the generic BaseSelect/e-sign/
// reload-tolerant helpers from fixtures/documents.js — they are not
// document-specific, just the project's only home for them so far.
import { expect } from '@playwright/test'
import { AUTH, USERS, ESIGN_PIN } from './cast.js'
import { waitForSqlValue } from './db.js'
import { selectOption, selectFirstOption, expectStatusEventually, clickWhenReady } from './documents.js'

const CAPA_WORKFLOW_NAME = 'E2E CAPA Review & Approval'

/** Unique, greppable CAPA title for one test run. */
export function uniqueTitle(tag) {
  return `E2E CAPA ${tag} ${Date.now()}`
}

/**
 * Create a CAPA from the create page: fill required Classification fields,
 * pick the seeded workflow, confirm the auto-populated "Assign Step
 * Reviewers" dialog (role-expansion auto-selects the sole candidate per
 * seeded step role — same WorkflowReviewerPickerDialog documents/NCR use).
 * Ends on the new CAPA's detail page (DRAFT). Returns the title.
 *
 * Unlike NCR's raiseNc, reviewers are picked HERE (on create) — the CAPA
 * controller parks them in pendingReviewers until Open, but the picker
 * dialog itself fires before the POST /v1/services/capas call, not after.
 */
export async function createCapa(page, title, { priority = null } = {}) {
  await page.goto('/capas/create')
  await page.getByPlaceholder('Describe the CAPA…').fill(title)

  await selectFirstOption(page, 'Site')
  await selectFirstOption(page, 'Department')
  await selectFirstOption(page, 'CAPA Type')
  await selectFirstOption(page, 'Source')
  if (priority) {
    // Priority is a SegmentedControl — WAI-ARIA radiogroup, options are
    // role="radio", not role="button".
    await page.getByRole('radio', { name: priority, exact: true }).click()
  }

  // Workflow — auto-selected (single ACTIVE workflow for CAPA in E2ELAB);
  // click defensively so a slow IDB load doesn't leave it unset when Submit
  // fires (mirrors documents.js createSopDocument / nonconformances.js raiseNc).
  const workflowCard = page.getByRole('button', { name: `Select workflow ${CAPA_WORKFLOW_NAME}` })
  if (await workflowCard.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await workflowCard.click()
  }

  await page.getByRole('button', { name: 'Submit' }).click()

  // "Assign Step Reviewers" dialog — the seeded steps each have exactly one
  // role member, so both pickers auto-select once IDB resolves; just wait for
  // Confirm to enable (gated on the first/required step having a pick).
  // Generous timeout — the create POST + dialog data fetch have been observed
  // taking 20s+ under repeated test load (mirrors the identical comment in
  // nonconformances.js raiseNc), especially right after a worker-heavy
  // journey (J4's effectiveness-check job) leaves api/worker momentarily busy.
  await expect(page.getByText('Assign task to user for each workflow step before submitting.')).toBeVisible({
    timeout: 30_000,
  })
  const confirmBtn = page.getByRole('button', { name: 'Confirm' })
  await expect(confirmBtn).toBeEnabled({ timeout: 15_000 })
  await confirmBtn.click()

  await expect(page).toHaveURL(/\/capas\/(?!create)[0-9a-f-]{36}/, { timeout: 45_000 })
  await expect(page.getByText(title).first()).toBeVisible()
  return title
}

/** Owner opens a DRAFT CAPA (Open CAPA → confirm dialog → submitForReview). */
export async function openCapa(page, capaId) {
  await page.goto(`/capas/${capaId}`)
  await page.getByRole('button', { name: 'Open CAPA' }).click()
  // Anchor on the dialog title text (role=dialog reports hidden — see documents.js).
  await expect(page.getByText('Opening this CAPA starts the assigned workflow')).toBeVisible({
    timeout: 10_000,
  })
  await page.getByRole('button', { name: 'Open CAPA' }).last().click()
  await expectStatusEventually(page, /pending/i)
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
 * Owner closes a PENDING CAPA with every workflow step already terminal.
 * The Close dialog's effectiveness-check date defaults to a 90-day preset
 * (already valid — see CapasPageId.vue closeEcPresetDays), so the only gate
 * a normal UI flow can hit is "workflow steps still open"; leave the date
 * untouched unless the caller wants to exercise a specific preset.
 */
export async function closeCapa(page, { comments = '', ecPresetDays = null } = {}) {
  await page.getByRole('button', { name: 'Close CAPA' }).click()
  // "Close CAPA" also matches the action-bar button itself and the
  // Effectiveness section's planning-mode label — anchor on the dialog
  // heading specifically.
  await expect(page.getByRole('heading', { name: 'Close CAPA' })).toBeVisible({ timeout: 10_000 })
  if (ecPresetDays) {
    await page.getByRole('button', { name: `${ecPresetDays} days`, exact: true }).click()
  }
  if (comments) {
    await page.getByPlaceholder('Summary of the corrective action and verification of completion').fill(comments)
  }
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
