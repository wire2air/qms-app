// PW-J9 · J-09 — the DELAY step's runtime controls.
//
// A DELAY step is the one step type the engine parks instead of activating. It
// models the deferred check every quality process has — a CAPA effectiveness
// review 90 days after close, a re-inspection after a cure window — and it is
// the only place in the module where the RECORD OWNER, not the template, decides
// at runtime what happens next: arm it (SCHEDULE), drop it (SKIP), or push it out
// (EXTEND, capped).
//
// Nothing exercised it. `SELECT step_type, count(*) FROM workflow_steps` returns
// 31 APPROVAL + 33 ACTION and **zero DELAY** across every company on app-db, so
// every one of those controls — three REST intents, a worker wake-up job, a
// four-state life cycle and an extension counter — shipped with no coverage at
// all. `fixtures/workflowDelay.js` brings the template; this file walks the life
// cycle.
//
// ── THE ASSERTION THAT MATTERS MOST ─────────────────────────────────────────
// `EXTEND_DELAY` is deliberately UNSIGNED, even on a step that requires an
// e-signature: deferring a check is not a sign-off, so
// controllers/documents/workflowInstances.js short-circuits at step 2c, BEFORE
// the `requireEsignature` gate at step 3. That is easy to mistake for a missing
// control and "fix" — the module has a live finding (F-16) about per-module step
// actions collecting no signature, and hardening that finding runs straight
// through this code path.
//
// So the fixture's DELAY step sets `require_esignature = true` on purpose. The
// exemption is then pinned as a PAIR: extend collects no credential (test 3),
// and completing the SAME step still demands a PIN and still writes a Part-11
// signature row (test 4). Either assertion alone would be worthless — test 3
// would pass on a step that was never gated, and test 4 would pass on a step
// where everything is gated.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, ESIGN_PIN } from '../fixtures/cast.js'
import { sqlValue, waitForSqlValue } from '../fixtures/db.js'
import { clickWhenReady } from '../fixtures/documents.js'
import {
  MAX_DELAY_EXTENSIONS,
  assignmentStatusesOn,
  actionableTaskFor,
  delayStepAction,
  delayStepOf,
  ensureDelayTemplates,
  errorMessage,
  fireDelayNow,
  gotoCapaWorkflow,
  instanceOfCapa,
  reachScheduledDelay,
  signatureCountOn,
  stepsOfCapa,
  taskStatusesOn,
} from '../fixtures/workflowDelay.js'

test.use({ storageState: AUTH.author }) // author owns every CAPA these tests create

test.beforeAll(() => {
  ensureDelayTemplates()
})

const DAY = 86_400
const PIN_FIELD = 'Enter your e-signature PIN'

/** delay_until is "about N days out" — tolerant of clock skew and test latency. */
function expectDelayInDays(step, days, label) {
  expect(step.delayUntilEpoch, `${label}: a wake time is armed`).toBeTruthy()
  const offset = step.delayUntilEpoch - Date.now() / 1000
  expect(offset, `${label}: wake time is ~${days}d out (got ${Math.round(offset / DAY)}d)`)
    .toBeGreaterThan((days - 0.5) * DAY)
  expect(offset, `${label}: wake time is ~${days}d out`).toBeLessThan((days + 0.5) * DAY)
}

/** Barrier on the delay step's own columns before reading them. */
async function waitForDelayStep(capaId, predicateSql, label) {
  await waitForSqlValue(
    `SELECT count(*) FROM workflow_instance_steps wis
       JOIN workflow_instances wi ON wi.id = wis.workflow_instance_id
      WHERE wi.resource_type = 'Capa' AND wi.resource_id = '${capaId}'
        AND wis.step_type = 'DELAY' AND ${predicateSql}`,
    { timeoutMs: 30_000, label },
  )
  return delayStepOf(capaId)
}

test.describe('PW-J9 · DELAY step schedule / skip / extend', () => {
  test('parks SCHEDULED with no timer and no task, then the owner arms and re-arms it', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000)

    const { capaId } = await reachScheduledDelay(page, browser, {
      template: 'tail',
      tag: 'J9-schedule',
    })

    // ── 1. The park ──────────────────────────────────────────────────────────
    // "Awaiting scheduling": SCHEDULED but with delay_until NULL, which
    // activateInstanceStep produces when the template carries no default window.
    // The distinction is load-bearing — DEFERRED_DELAY_WHERE treats an armed
    // delay as deferrable at close and an un-armed one as still blocking
    // (PW-J10), so a step that silently armed itself would change that verdict.
    let delay = delayStepOf(capaId)
    expect(delay.statusId, 'the DELAY step parks rather than activating').toBe('SCHEDULED')
    expect(delay.delayUntilEpoch, 'with no timer — the owner has not decided yet').toBeNull()
    expect(delay.delayExtensionCount, 'and no extension consumed').toBe(0)

    // Parked means parked: the assignees are pre-written but NOT promoted, and
    // no task exists. Every notification in this engine rides the task INSERT,
    // so "no task" is also "nobody has been told to do anything yet" — correct
    // for a step whose date is not set.
    expect(assignmentStatusesOn(delay.id), 'assignments are parked PENDING').toEqual({ PENDING: 1 })
    expect(taskStatusesOn(delay.id), 'a parked delay step mints no task').toEqual({})

    // ── 2. The owner's view ──────────────────────────────────────────────────
    await gotoCapaWorkflow(page, capaId)
    await expect(page.getByText('Awaiting scheduling.')).toBeVisible({ timeout: 30_000 })
    // Extend is post-fire only (canExtendDelay requires IN_PROGRESS) — offering
    // it here would let the owner burn an extension on a timer that isn't running.
    await expect(page.getByRole('button', { name: 'Extend', exact: true })).toHaveCount(0)

    // ── 3. Arm it: 30 days ───────────────────────────────────────────────────
    await clickWhenReady(page, page.getByRole('button', { name: 'Schedule', exact: true }).first())
    await expect(page.getByRole('heading', { name: 'Schedule Delay Step' })).toBeVisible({
      timeout: 10_000,
    })
    await page.getByRole('button', { name: '30 days', exact: true }).click()
    // `.last()` is the dialog's footer submit — the step-header button that
    // opened it carries the same exact label and precedes it in the DOM.
    await page.getByRole('button', { name: 'Schedule', exact: true }).last().click()

    delay = await waitForDelayStep(capaId, 'wis.delay_until IS NOT NULL', 'delay armed at 30 days')
    expect(delay.statusId, 'still parked — arming is not activating').toBe('SCHEDULED')
    expectDelayInDays(delay, 30, 'after SCHEDULE')
    expect(taskStatusesOn(delay.id), 'arming still mints no task').toEqual({})

    // ── 4. Re-arm it: 60 days ────────────────────────────────────────────────
    // The contract `setDelayScheduleCore` documents is that rescheduling "does
    // NOT touch the extension counter — this is the owner arming the step, not
    // an extension". Nothing enforced that but this assertion: if a reschedule
    // ever started consuming the cap, an owner correcting a typo would silently
    // spend the record's one permitted extension.
    await clickWhenReady(page, page.getByRole('button', { name: 'Reschedule', exact: true }).first())
    await expect(page.getByRole('heading', { name: 'Reschedule Delay Step' })).toBeVisible({
      timeout: 10_000,
    })
    await page.getByRole('button', { name: '60 days', exact: true }).click()
    await page.getByRole('button', { name: 'Reschedule', exact: true }).last().click()

    delay = await waitForDelayStep(
      capaId,
      `wis.delay_until > NOW() + INTERVAL '45 days'`,
      'delay re-armed at 60 days',
    )
    expectDelayInDays(delay, 60, 'after RESCHEDULE')
    expect(delay.delayExtensionCount, 'a reschedule is NOT an extension').toBe(0)
    expect(instanceOfCapa(capaId).statusId, 'the instance is untouched throughout').toBe(
      'IN_PROGRESS',
    )
  })

  test('the owner can SKIP the check, and the workflow advances to the next step', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000)

    // The `mid` template puts an ACTION step AFTER the delay, so "the workflow
    // advanced" is observable as the next step going live — not merely as the
    // instance completing, which is what a trailing delay would show.
    const { capaId, template } = await reachScheduledDelay(page, browser, {
      template: 'mid',
      tag: 'J9-skip',
    })
    const delay = delayStepOf(capaId)

    await gotoCapaWorkflow(page, capaId)
    await clickWhenReady(page, page.getByRole('button', { name: 'Skip', exact: true }).first())
    // Controlled skip (2026-08-28): reason required, then PIN e-signature.
    await expect(page.getByRole('heading', { name: 'Skip Effectiveness Check' })).toBeVisible({
      timeout: 10_000,
    })
    await page
      .getByPlaceholder('Why is this check not needed?')
      .fill('J9 — check made redundant by the follow-up ACTION step.')
    await page.getByRole('button', { name: 'Sign & Skip' }).click()
    // The esign dialog opens on the heels of the skip dialog closing; a fill
    // that lands mid-handoff can be wiped by the remount. Retry until the
    // Sign button acknowledges the PIN (same hardening as capas PW-J10).
    const pinBox = page.getByPlaceholder('Enter your e-signature PIN')
    await expect(async () => {
      await pinBox.fill('12345678')
      await expect(page.getByRole('button', { name: 'Sign', exact: true })).toBeEnabled({
        timeout: 1500,
      })
    }).toPass({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Sign', exact: true }).click()

    await waitForDelayStep(capaId, `wis.status_id = 'SKIPPED'`, 'delay step skipped')

    const after = stepsOfCapa(capaId)
    const skipped = after.find((s) => s.id === delay.id)
    expect(skipped.statusId, 'the delay step is SKIPPED, not cancelled').toBe('SKIPPED')
    // SKIPPED is terminal-for-close (countOpenStepsForClose excludes it) and
    // terminal-for-parent (assertChildStepsApproved), so the parked assignment
    // must not be left dangling as PENDING work in the assignee's queue.
    expect(assignmentStatusesOn(skipped.id), 'its parked assignment is cancelled').toEqual({
      CANCELLED: 1,
    })

    const next = after.find((s) => s.stepId === template.action3)
    expect(next, 'the template has a step after the delay').toBeTruthy()
    await waitForSqlValue(
      `SELECT count(*) FROM task_instances
        WHERE source_type = 'WorkflowInstanceStep' AND source_id = '${next.id}'
          AND assigned_to = '${USERS.reviewer.id}' AND status_id = 'ASSIGNED'`,
      { timeoutMs: 30_000, label: 'the step after the delay activated and minted its task' },
    )
    expect(stepsOfCapa(capaId).find((s) => s.id === next.id).statusId).toBe('IN_PROGRESS')
    expect(instanceOfCapa(capaId).statusId, 'skipping advances, it does not terminate').toBe(
      'IN_PROGRESS',
    )
  })

  test('the assignee EXTENDS from the task card with NO e-signature, and the cap holds', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000)

    const { capaId } = await reachScheduledDelay(page, browser, {
      template: 'tail',
      tag: 'J9-extend',
    })
    let delay = delayStepOf(capaId)

    // PREMISE. Without this the whole test is vacuous: "no signature prompt
    // appeared" is trivially true on a step that requires no signature.
    expect(
      delay.requireEsignature,
      'the fixture DELAY step demands an e-signature — that is what makes the extend exemption meaningful',
    ).toBe(true)

    // Arm it in the past so the worker's wake-up fires now rather than in 30
    // days. Only a FIRED delay has a task, and the task card is the surface
    // J-09 specifies for the assignee-side extend.
    await fireDelayNow(page.request, capaId, delay.id)
    delay = delayStepOf(capaId)
    expect(delay.statusId, 'the wake-up job activated the step').toBe('IN_PROGRESS')
    expect(assignmentStatusesOn(delay.id), 'and promoted its assignment').toEqual({ ASSIGNED: 1 })
    const firedTaskId = actionableTaskFor(delay.id, USERS.approver.id)
    expect(firedTaskId, 'the assignee now holds an actionable task').toBeTruthy()

    // ── The assignee extends ─────────────────────────────────────────────────
    const ctx = await browser.newContext({ storageState: AUTH.approver })
    const assigneePage = await ctx.newPage()
    // Record what the browser actually posts. Asserting on the absence of a
    // dialog proves the UI did not ASK for a credential; asserting on the body
    // proves none was SENT — the second is the one that would catch a silently
    // auto-filled signature.
    const actionPosts = []
    assigneePage.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/action')) {
        actionPosts.push({ url: req.url(), body: req.postDataJSON?.() ?? null })
      }
    })
    const pin = assigneePage.getByPlaceholder(PIN_FIELD)

    try {
      await gotoCapaWorkflow(assigneePage, capaId)
      // The fired check presents the effectiveness decision panel (2026-08-28)
      // — Extend Monitoring is one of its options, not a standalone button.
      // Picking it opens the same extend dialog as before.
      await expect(assigneePage.getByText('Effectiveness decision')).toBeVisible({
        timeout: 30_000,
      })
      await assigneePage.getByRole('radio', { name: 'Extend Monitoring', exact: true }).click()
      await expect(assigneePage.getByRole('heading', { name: 'Extend Delay' })).toBeVisible({
        timeout: 10_000,
      })
      // 🔴 The guard. If A2's F-16 work (or anything else) starts routing
      // EXTEND_DELAY through the e-signature gate, the PIN dialog appears here
      // INSTEAD of the extend form and this fails immediately.
      await expect(pin, 'extend must not open an e-signature dialog').toHaveCount(0)

      await assigneePage.getByRole('button', { name: '30 days', exact: true }).click()
      await assigneePage
        .getByPlaceholder('Why is the delay being extended?')
        .fill('E2E — evidence not available yet; pushing the effectiveness window out.')
      await assigneePage.getByRole('button', { name: 'Extend Delay', exact: true }).click()

      await waitForSqlValue(
        `SELECT count(*) FROM workflow_instance_steps WHERE id = '${delay.id}' AND delay_extension_count = 1`,
        { timeoutMs: 30_000, label: 'assignee extension recorded' },
      )
      await expect(pin, 'and must not demand one on the way out either').toHaveCount(0)
    } finally {
      await assigneePage.close()
      await ctx.close()
    }

    expect(actionPosts.length, 'exactly one task action was posted').toBe(1)
    expect(actionPosts[0].url, 'through the generic task-action endpoint, on the assignee task').toContain(
      `/taskInstances/${firedTaskId}/action`,
    )
    expect(actionPosts[0].body?.action, 'as EXTEND_DELAY').toBe('EXTEND_DELAY')
    expect(
      actionPosts[0].body?.token ?? actionPosts[0].body?.method ?? null,
      'carrying no signature credential at all',
    ).toBeNull()

    // The deadline moves, the work stays open (2026-08-18, extendDelayCore):
    // extending a FIRED step no longer re-parks it. The step stays IN_PROGRESS
    // with its task ASSIGNED — the assignee just asked for more time, locking
    // them out of recording the verdict early would be perverse — and only the
    // due date (with its reminder chain) is pushed out.
    delay = delayStepOf(capaId)
    expect(delay.statusId, 'the step stays IN_PROGRESS — the work remains open').toBe('IN_PROGRESS')
    expect(delay.delayExtensionCount).toBe(1)
    expectDelayInDays(delay, 30, 'after the assignee extension')
    expect(
      taskStatusesOn(delay.id),
      'the task stays ASSIGNED — extend moves the reminder, not the work',
    ).toEqual({ ASSIGNED: 1 })
    expect(assignmentStatusesOn(delay.id), 'its assignment stays promoted').toEqual({
      ASSIGNED: 1,
    })
    expect(
      sqlValue(
        `SELECT (due_date > NOW() + INTERVAL '28 days') FROM task_instances WHERE id = '${firedTaskId}'`,
      ),
      "the assignee task's due date moved with the extension",
    ).toBe('t')
    expect(signatureCountOn(delay.id), 'and no Part-11 signature was manufactured').toBe(0)

    // ── The cap ──────────────────────────────────────────────────────────────
    // Owner path (delayStepAction / intent EXTEND), which unlike the task path
    // also works on a still-SCHEDULED step. maxDelayExtensions is 2 on this
    // template, so the second extension is the last legal one.
    const second = await delayStepAction(page.request, capaId, {
      workflowInstanceStepId: delay.id,
      intent: 'EXTEND',
      extendByDays: 45,
      reason: 'E2E — second and final permitted extension.',
    })
    expect(second.status(), `owner extension ${MAX_DELAY_EXTENSIONS} of ${MAX_DELAY_EXTENSIONS}`).toBe(200)
    // Barrier, not a bare read — see awaitDelayStep: the 200 lands before the
    // request transaction commits, so reading here directly is a real race and
    // was observed failing "expected 2, received 1".
    delay = await waitForDelayStep(
      capaId,
      `wis.delay_extension_count = ${MAX_DELAY_EXTENSIONS}`,
      'second extension recorded',
    )
    expectDelayInDays(delay, 45, 'after the second extension')

    const overCap = await delayStepAction(page.request, capaId, {
      workflowInstanceStepId: delay.id,
      intent: 'EXTEND',
      extendByDays: 45,
      reason: 'E2E — one past the cap; must be refused.',
    })
    expect(overCap.status(), 'the cap is enforced server-side, not just in the UI').toBe(400)
    expect(await errorMessage(overCap)).toMatch(/Maximum 2 delay extensions already used/i)

    const unchanged = delayStepOf(capaId)
    expect(unchanged.delayExtensionCount, 'the refused call consumed nothing').toBe(
      MAX_DELAY_EXTENSIONS,
    )
    expect(unchanged.delayUntilEpoch, 'and moved nothing').toBe(delay.delayUntilEpoch)
  })

  test('CONTROL: the same DELAY step still demands an e-signature to COMPLETE', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000)

    // The other half of the pair. If this ever goes red at the same time as the
    // extend test goes green, the exemption has stopped being surgical and the
    // step is simply ungated.
    const { capaId } = await reachScheduledDelay(page, browser, {
      template: 'tail',
      tag: 'J9-esigncontrol',
    })
    const delay = delayStepOf(capaId)
    await fireDelayNow(page.request, capaId, delay.id)

    const ctx = await browser.newContext({ storageState: AUTH.approver })
    const assigneePage = await ctx.newPage()
    try {
      await gotoCapaWorkflow(assigneePage, capaId)
      // Completing a check is recording its verdict (2026-08-28): pick
      // Effective and give the required supporting comment before Mark
      // Complete enables. The label is derived from stepType, the signature
      // requirement is not.
      await expect(assigneePage.getByText('Effectiveness decision')).toBeVisible({
        timeout: 30_000,
      })
      await assigneePage.getByRole('radio', { name: 'Effective', exact: true }).click()
      await assigneePage
        .getByPlaceholder(/What supports this decision/)
        .fill('J9 control — verified effective; signing the completion.')
      await clickWhenReady(
        assigneePage,
        assigneePage.getByRole('button', { name: 'Mark Complete', exact: true }),
      )
      const pin = assigneePage.getByPlaceholder(PIN_FIELD)
      await expect(pin, 'completing the step DOES demand a credential').toBeVisible({
        timeout: 15_000,
      })
      await pin.fill(ESIGN_PIN)
      await assigneePage.getByRole('button', { name: 'Sign', exact: true }).click()

      await waitForSqlValue(
        `SELECT count(*) FROM workflow_instance_steps WHERE id = '${delay.id}' AND status_id = 'APPROVED'`,
        { timeoutMs: 45_000, label: 'signed completion landed' },
      )
    } finally {
      await assigneePage.close()
      await ctx.close()
    }

    expect(signatureCountOn(delay.id), 'and writes exactly one Part-11 signature row').toBe(1)
  })
})
