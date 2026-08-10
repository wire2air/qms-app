// PW-J10 · J-10 — closing a record while a deferred DELAY step is still running.
//
// The whole point of a DELAY step is that it OUTLIVES the record. A CAPA's
// effectiveness check is scheduled for 90 days after closure; closing the CAPA
// must not cancel it, and the check must not stop the closure. Two independent
// pieces of code have to agree for that to hold:
//
//   countOpenStepsForClose   — a deferred delay does not count as "still open"
//   finalizeWorkflowForClose — a deferred delay keeps the whole workflow
//                              instance IN_PROGRESS instead of cancelling it
//
// and they agree only because they share one predicate, `DEFERRED_DELAY_WHERE`.
// If they ever diverge the failure is silent and asymmetric: either the record
// can never be closed, or it closes and the check it promised is cancelled with
// no notification to anyone. There were zero DELAY steps anywhere on app-db, so
// neither branch had ever executed, let alone been tested.
//
// The predicate's third state matters as much as the other two: a delay that is
// SCHEDULED **with no date** is not deferred, it is un-armed — it would never
// fire, so it still blocks the close until the owner schedules or skips it.
// Test 1 pins that; test 2 pins the deferral; test 3 is the control that shows
// the deferral, not the close path itself, is what keeps the instance alive.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, ESIGN_PIN, USERS } from '../fixtures/cast.js'
import { sqlValue, waitForSqlValue } from '../fixtures/db.js'
import { closeCapa } from '../fixtures/capas.js'
import {
  assignmentStatusesOn,
  awaitCapaStatus,
  awaitDelayStep,
  delayJobQueued,
  delayStepAction,
  delayStepOf,
  ensureDelayTemplates,
  errorMessage,
  gotoCapaWorkflow,
  instanceOfCapa,
  reachScheduledDelay,
  stepsOfCapa,
} from '../fixtures/workflowDelay.js'

test.use({ storageState: AUTH.author }) // author owns every CAPA these tests create

test.beforeAll(() => {
  ensureDelayTemplates()
})

/** The real close endpoint, with a valid future effectiveness-check date. */
function closeRequest(page, capaId, comments) {
  return page.request.post(`/api/v1/services/capas/${capaId}/close`, {
    data: {
      effectivenessCheckAt: new Date(Date.now() + 90 * 86_400_000).toISOString(),
      comments,
      method: 'PIN',
      token: ESIGN_PIN,
      provider: null,
    },
  })
}

const capaStatus = (capaId) => sqlValue(`SELECT status_id FROM capas WHERE id = '${capaId}'`)

test.describe('PW-J10 · close gate with a deferred DELAY step', () => {
  test('an UN-ARMED delay (SCHEDULED, no date) still blocks the close', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000)

    // The template carries no default window, so the step parks with
    // delay_until NULL. It is not deferrable — nothing would ever fire it — and
    // letting it through would close the record on the strength of a check that
    // can never happen.
    const { capaId } = await reachScheduledDelay(page, browser, {
      template: 'tail',
      tag: 'J10-unarmed',
    })
    const delay = delayStepOf(capaId)
    expect(delay.statusId).toBe('SCHEDULED')
    expect(delay.delayUntilEpoch, 'un-armed: no wake time').toBeNull()

    const res = await closeRequest(page, capaId, 'E2E — must be refused while the delay is un-armed.')
    expect(res.status(), 'the server refuses the close').toBe(409)
    expect(await errorMessage(res)).toMatch(/1 workflow step still open/i)
    expect(capaStatus(capaId), 'and the record did not move').toBe('PENDING')
    expect(instanceOfCapa(capaId).statusId).toBe('IN_PROGRESS')
  })

  test('an ARMED delay defers: the close succeeds and the instance stays IN_PROGRESS', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000)

    const { capaId } = await reachScheduledDelay(page, browser, {
      template: 'tail',
      tag: 'J10-deferred',
    })
    let delay = delayStepOf(capaId)

    // Arm it 90 days out — the canonical effectiveness-check window.
    const scheduled = await delayStepAction(page.request, capaId, {
      workflowInstanceStepId: delay.id,
      intent: 'SCHEDULE',
      delayDays: 90,
    })
    expect(scheduled.status(), `SCHEDULE — ${await scheduled.text().catch(() => '')}`).toBe(200)
    // Barrier rather than a bare read — the 200 is written before the request
    // transaction commits (see awaitDelayStep).
    delay = await awaitDelayStep(capaId, 'wis.delay_until IS NOT NULL', 'delay armed at 90 days')
    expect(delay.delayUntilEpoch, 'armed').toBeTruthy()
    expect(delayJobQueued(delay.id), 'and a wake-up job is queued for it').toBe(true)

    // Close through the real UI dialog (Close CAPA → Sign & Close CAPA → PIN →
    // Sign) — the frontend runs the SAME deferred-delay predicate to decide
    // whether to enable the button (CapasPageId.vue's countStepsBlockingClose),
    // so driving the UI proves both sides agree rather than only the server.
    await gotoCapaWorkflow(page, capaId)
    await expect(page.getByRole('button', { name: 'Close CAPA' })).toBeEnabled({ timeout: 30_000 })
    await closeCapa(page, { comments: 'E2E — closing with the effectiveness check still pending.' })

    await waitForSqlValue(
      `SELECT count(*) FROM capas WHERE id = '${capaId}' AND status_id = 'CLOSED'`,
      { timeoutMs: 45_000, label: 'CAPA closed' },
    )

    // ── HALF 1: the record is closed ─────────────────────────────────────────
    expect(capaStatus(capaId), 'the record reached its closed state').toBe('CLOSED')
    expect(
      sqlValue(`SELECT closed_at IS NOT NULL FROM capas WHERE id = '${capaId}'`),
      'with a closure timestamp',
    ).toBe('t')

    // ── HALF 2: the workflow survived it ─────────────────────────────────────
    // `finalizeWorkflowForClose` cancels the instance for every other shape of
    // record. Here it must not: the worker task refuses to fire a delay whose
    // instance is not IN_PROGRESS, so cancelling here would silently kill the
    // check the closure dialog just promised.
    const instance = instanceOfCapa(capaId)
    expect(instance.statusId, 'the workflow instance is NOT force-cancelled').toBe('IN_PROGRESS')

    const after = stepsOfCapa(capaId)
    const survivor = after.find((s) => s.id === delay.id)
    expect(survivor.statusId, 'the deferred step is untouched').toBe('SCHEDULED')
    expect(survivor.delayUntilEpoch, 'and keeps the exact wake time it was armed with').toBe(
      delay.delayUntilEpoch,
    )
    expect(assignmentStatusesOn(survivor.id), 'its assignment is not cancelled either').toEqual({
      PENDING: 1,
    })
    expect(
      after.find((s) => s.stepOrder === 1).statusId,
      'the already-finished step stays finished',
    ).toBe('APPROVED')

    // The status columns alone would still be consistent with a dead timer.
    // This is the assertion that the check will actually FIRE: the graphile job
    // keyed `wf-delay-step:<stepId>` is still queued after the close.
    expect(delayJobQueued(survivor.id), 'the wake-up job survived the close').toBe(true)
  })

  test('CONTROL: with the delay SKIPPED instead, the close leaves no IN_PROGRESS workflow', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000)

    // Same record shape, same close endpoint, one difference: nothing is
    // deferred. If the instance came out IN_PROGRESS here too, test 2 would be
    // passing because close never touches workflows — not because the deferral
    // is being honoured.
    const { capaId } = await reachScheduledDelay(page, browser, {
      template: 'tail',
      tag: 'J10-control',
    })
    const delay = delayStepOf(capaId)

    const skipped = await delayStepAction(page.request, capaId, {
      workflowInstanceStepId: delay.id,
      intent: 'SKIP',
    })
    expect(skipped.status(), `SKIP — ${await skipped.text().catch(() => '')}`).toBe(200)

    // The delay was the last step, so skipping it completes the whole instance.
    await waitForSqlValue(
      `SELECT count(*) FROM workflow_instances wi
        WHERE wi.resource_type = 'Capa' AND wi.resource_id = '${capaId}'
          AND wi.status_id = 'COMPLETED'`,
      { timeoutMs: 30_000, label: 'workflow completed after the skip' },
    )

    const res = await closeRequest(page, capaId, 'E2E — control close, nothing deferred.')
    expect(res.status(), `close — ${await res.text().catch(() => '')}`).toBe(200)
    await awaitCapaStatus(capaId, 'CLOSED')
    expect(capaStatus(capaId)).toBe('CLOSED')
    expect(
      instanceOfCapa(capaId).statusId,
      'no deferred step ⇒ nothing is left running',
    ).not.toBe('IN_PROGRESS')
  })
})
