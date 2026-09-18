// Workflow screenshots · S2 — the RUNTIME side of the engine.
//   The Approvals Inbox, a live instance's step timeline, the assigned
//   reviewer's action controls and their Reject dialog, the same step carrying
//   TWO assignees, the terminated (rejected) cycle, a DELAY step parked
//   "awaiting scheduling" plus its Schedule dialog, and the supplier bounce off
//   the inbox.
//
// Everything rides journeys that already exist:
//   · the live instance is PW-J6/J7/J8's — a Change Request submitted through
//     the real create → assign-reviewers → submit flow (createLiveWorkflowInstance)
//   · the second assignee is PW-J6's `addStepAssignee`, which writes exactly
//     what `createActiveStepAssignments` writes for a genuine two-member pool
//     (the seeded pools have one member each, and widening a SHARED template
//     would hand another suite the wrong reviewer — see the fixture header)
//   · the rejection is PW-J7's module endpoint + its signature fallback
//   · the DELAY step is PW-J9's fixture template and its UI controls
//   · the supplier denial is PW-J14's (SUPPLIER_BLOCKED_SEGMENTS)
//
// Contexts are opened and closed ONE AT A TIME on purpose: holding two
// authenticated contexts makes the first tab sign itself out mid-run (SUP-J8's
// header documents the same thing), and the documents screenshot suite is
// written the same way.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, ESIGN_PIN, SUPPLIER_USER, USERS } from '../../fixtures/cast.js'
import { sqlValue } from '../../fixtures/db.js'
import { clickWhenReady } from '../../fixtures/documents.js'
import { freshContext } from '../../fixtures/sites.js'
import { createLiveWorkflowInstance } from '../../fixtures/workflow.js'
import {
  CR_CREATE_STORES,
  errorMessage,
  postAs,
  stepRowsOf,
  stepStatus,
  tasksOnStep,
  warmUpSyncEngine,
} from '../../fixtures/workflowMultiApprover.js'
import {
  awaitDelayStep,
  delayStepOf,
  ensureDelayTemplates,
  gotoCapaWorkflow,
  reachScheduledDelay,
} from '../../fixtures/workflowDelay.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('workflow')

// Multi-actor UI flows against a shared dev stack, plus a 3s pause per capture.
test.describe.configure({ mode: 'serial', timeout: 900_000 })

let crId = null
let instanceId = null
let step1 = null

/** True when the server refused because it wanted a Part-11 signature. (PW-J7) */
function demandsSignature(res) {
  return res.status >= 400 && /e-?signature|signature is required|token/i.test(errorMessage(res.body))
}

/** Reject as the step's assignee, signing only if the server asks. (PW-J7) */
async function rejectStepAsAssignee(browser, storageState, id, stepId, comment) {
  const url = `/api/v1/services/changeRequests/${id}/rejectStepTask`
  const unsigned = await postAs(browser, storageState, url, {
    workflowInstanceStepId: stepId,
    comment,
  })
  if (!demandsSignature(unsigned)) return unsigned
  return postAs(browser, storageState, url, {
    workflowInstanceStepId: stepId,
    comment,
    token: ESIGN_PIN,
    method: 'PIN',
    provider: null,
  })
}

test.describe('Workflow screenshots · the approvals inbox and a live instance', () => {
  test('the inbox, and the instance a submitted record produced', async ({ browser }) => {
    test.setTimeout(600_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()

    // Each Playwright context bootstraps the syncEngine from zero; barrier on
    // the create form's lookup data rather than letting an empty listbox read
    // as a UI defect (see warmUpSyncEngine).
    await warmUpSyncEngine(page, CR_CREATE_STORES)

    await page.goto('/workflow-instances', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Approvals Inbox').first()).toBeVisible({ timeout: 60_000 })
    await shot(page, 'approvals-inbox')

    ;({ crId, instanceId } = await createLiveWorkflowInstance(page, 'S2-instance'))
    const steps = stepRowsOf(instanceId)
    expect(steps.length, 'the seeded CR template instantiates three steps').toBe(3)
    ;[step1] = steps
    expect(step1.statusId, 'submit activates the first root step').toBe('IN_PROGRESS')

    await page.goto(`/workflow-instances/${instanceId}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: `Step 1: ${step1.name}` })).toBeVisible({
      timeout: 90_000,
    })
    await shot(page, 'instance-detail')

    await ctx.close()
  })

  test('the assigned reviewer: action controls, the Reject dialog, a second approver', async ({
    browser,
  }) => {
    test.setTimeout(600_000)
    expect(instanceId, 'depends on the instance test').toBeTruthy()

    const ctx = await browser.newContext({ storageState: AUTH.reviewer })
    const page = await ctx.newPage()
    await page.goto(`/workflow-instances/${instanceId}`, { waitUntil: 'domcontentloaded' })

    // The action panel renders only for the signed-in user's own ASSIGNED task.
    await expect(page.getByText('Your required action')).toBeVisible({ timeout: 90_000 })
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible()
    await shot(page, 'instance-active-step-actions')

    // ── Reject: the reason is mandatory (the backend enforces it too) ───────
    await page.getByRole('button', { name: 'Reject' }).click()
    const dialog = page.getByRole('dialog').last()
    await expect(page.getByRole('heading', { name: 'Reject Step' })).toBeVisible({
      timeout: 15_000,
    })
    await dialog.locator('textarea').first().fill('Screenshot run — impact assessment incomplete.')
    await shot(page, 'instance-reject-dialog')
    // Captured, not submitted: the rejection itself is driven below through the
    // module endpoint PW-J7 uses, so the capture cannot depend on which of the
    // two reject paths is wired to this button.
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { name: 'Reject Step' })).toBeHidden({ timeout: 15_000 })

    // ── A second assignee on the same step (PW-J6's instance-side setup) ────
    postAs // (no-op reference removed below — see addStepAssignee import note)
    await ctx.close()
  })
})

test.describe('Workflow screenshots · a multi-approver step and a rejected cycle', () => {
  test('two assignees on one step, then the terminated cycle', async ({ browser }) => {
    test.setTimeout(600_000)
    expect(instanceId, 'depends on the instance test').toBeTruthy()

    // Built on the INSTANCE exactly as `createActiveStepAssignments` would for a
    // two-member pool: one users_on_workflow_instance_steps row + one
    // task_instances row. fixtures/workflowMultiApprover.js explains at length
    // why widening the shared template instead is not an option.
    const { addStepAssignee } = await import('../../fixtures/workflowMultiApprover.js')
    addStepAssignee(step1.id, {
      userId: USERS.approver.id,
      companyId: COMPANY_ID,
      entityType: 'ChangeRequest',
      entityId: crId,
    })
    expect(tasksOnStep(step1.id).length, 'the step now carries two open tasks').toBe(2)

    const reviewerCtx = await browser.newContext({ storageState: AUTH.reviewer })
    const reviewerPage = await reviewerCtx.newPage()
    await reviewerPage.goto(`/workflow-instances/${instanceId}`, { waitUntil: 'domcontentloaded' })
    // The active step card counts approvals against the whole assignee list —
    // "0 of 2 completed" is the multi-approver state rendering.
    await expect(reviewerPage.getByText('0 of 2 completed')).toBeVisible({ timeout: 90_000 })
    await shot(reviewerPage, 'instance-step-multi-approver')
    await reviewerCtx.close()

    // ── The rejection (PW-J7's path), then the terminated instance ──────────
    const rejected = await rejectStepAsAssignee(
      browser,
      AUTH.reviewer,
      crId,
      step1.id,
      'Screenshot run — the impact assessment missed a downstream system.',
    )
    expect(rejected.status, `reject accepted: ${errorMessage(rejected.body)}`).toBe(200)
    await expect
      .poll(() => stepStatus(step1.id), { message: 'the rejection committed', timeout: 60_000 })
      .toBe('REJECTED')
    await expect
      .poll(() => sqlValue(`SELECT status_id FROM workflow_instances WHERE id = '${instanceId}'`), {
        message: 'the cycle is dead',
        timeout: 60_000,
      })
      .toBe('REJECTED')

    const ownerCtx = await browser.newContext({ storageState: AUTH.author })
    const ownerPage = await ownerCtx.newPage()
    await ownerPage.goto(`/workflow-instances/${instanceId}`, { waitUntil: 'domcontentloaded' })
    await expect(ownerPage.getByRole('heading', { name: `Step 1: ${step1.name}` })).toBeVisible({
      timeout: 90_000,
    })
    await expect(ownerPage.getByText('Rejected').first()).toBeVisible({ timeout: 30_000 })
    await shot(ownerPage, 'instance-rejected')
    await ownerCtx.close()
  })
})

test.describe('Workflow screenshots · a DELAY step and the inbox denial', () => {
  test.beforeAll(() => {
    // The E2E tenant has no DELAY step anywhere — the fixture brings its own
    // (deliberately INACTIVE) template so no module picker changes.
    ensureDelayTemplates()
  })

  test('a parked DELAY step and the owner arming it', async ({ browser }) => {
    test.setTimeout(600_000)
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()

    const { capaId } = await reachScheduledDelay(page, browser, {
      template: 'tail',
      tag: 'S2-delay',
    })
    const delay = delayStepOf(capaId)
    expect(delay.statusId, 'the DELAY step parks rather than activating').toBe('SCHEDULED')
    expect(delay.delayUntilEpoch, 'with no timer — the owner has not decided yet').toBeNull()

    await gotoCapaWorkflow(page, capaId)
    await expect(page.getByText('Awaiting scheduling.')).toBeVisible({ timeout: 30_000 })
    await shot(page, 'delay-step-awaiting-scheduling')

    await clickWhenReady(page, page.getByRole('button', { name: 'Schedule', exact: true }).first())
    await expect(page.getByRole('heading', { name: 'Schedule Delay Step' })).toBeVisible({
      timeout: 15_000,
    })
    await page.getByRole('button', { name: '30 days', exact: true }).click()
    await shot(page, 'delay-schedule-dialog')
    // `.last()` is the dialog's footer submit — the step-header button that
    // opened it carries the same exact label (PW-J9).
    await page.getByRole('button', { name: 'Schedule', exact: true }).last().click()

    await awaitDelayStep(capaId, 'wis.delay_until IS NOT NULL', 'delay armed at 30 days')
    // Armed, still parked: the header control becomes Reschedule.
    await expect(page.getByRole('button', { name: 'Reschedule', exact: true }).first()).toBeVisible({
      timeout: 30_000,
    })
    await shot(page, 'delay-step-scheduled')

    await ctx.close()
  })

  test('an external supplier is bounced off the Approvals Inbox', async ({ browser }) => {
    test.setTimeout(180_000)
    // PW-J14: `workflow-instances` is in SUPPLIER_BLOCKED_SEGMENTS, checked
    // before the permission map — the list AND the deep-linked detail route.
    const ctx = await freshContext(browser, SUPPLIER_USER)
    const page = await ctx.newPage()
    await page.goto('/workflow-instances', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/no-access/, { timeout: 30_000 })
    await shot(page, 'inbox-supplier-no-access')
    await ctx.close()
  })
})
