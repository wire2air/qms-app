// PW-J2 · Manager competency verification (P0).
//
// Runs on top of a real completed training (PW-J1's flow), because the verify
// endpoint only accepts an instance already in PENDING_VERIFICATION.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, TRAINING } from '../fixtures/cast.js'
import { sqlRow, sqlValue } from '../fixtures/db.js'
import {
  launchTraining,
  completeTrainingViaUi,
  findAssignee,
  waitForAssigneeStatus,
  instanceStatus,
  verifyAssignees,
} from '../fixtures/training.js'

/** Launch → learner completes with the given answers → returns the instance id. */
async function instanceWithCompletedLearner(browser, answers = TRAINING.correctAnswers) {
  const adminCtx = await browser.newContext({ storageState: AUTH.trainingAdmin })
  const adminPage = await adminCtx.newPage()
  const instanceId = await launchTraining(adminPage)
  await adminCtx.close()

  const learnerCtx = await browser.newContext({ storageState: AUTH.learner })
  const learnerPage = await learnerCtx.newPage()
  await completeTrainingViaUi(learnerPage, instanceId, answers)
  await learnerCtx.close()
  return instanceId
}

test.describe('PW-J2 · manager competency verification', () => {
  test('manager verifies a passed learner → VERIFIED, instance COMPLETED, verification recorded', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const instanceId = await instanceWithCompletedLearner(browser)
    await waitForAssigneeStatus(instanceId, 'COMPLETED')
    expect(instanceStatus(instanceId)).toBe('PENDING_VERIFICATION')

    // The manager also gets a TRAINING_VERIFICATION task pointing at the instance.
    const taskCount = sqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'TrainingInstance' AND entity_id = '${instanceId}'
          AND task_kind_id = 'TRAINING_VERIFICATION' AND assigned_to = '${USERS.trainingAdmin.id}'`,
    )
    expect(Number(taskCount), 'the manager of record is queued to verify').toBe(1)

    const assignee = findAssignee(instanceId)
    const ctx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const page = await ctx.newPage()
    const res = await verifyAssignees(page, instanceId, [assignee.id])
    expect(res.ok(), `verify should succeed: ${await res.text().catch(() => '')}`).toBeTruthy()
    await ctx.close()

    await waitForAssigneeStatus(instanceId, 'VERIFIED')
    expect(instanceStatus(instanceId), 'all assignees verified → instance closes').toBe('COMPLETED')

    // The competency record itself — three criteria + the verifier + signature.
    const row = sqlRow(
      `SELECT verified_by, demonstrated_understanding, can_perform_independently,
              practical_observation_completed, outcome, signed_at IS NOT NULL
         FROM training_verifications
        WHERE training_assignee_id = '${assignee.id}'`,
    )
    expect(row, 'a training_verifications row exists').toBeTruthy()
    expect(row[0]).toBe(USERS.trainingAdmin.id)
    expect(row.slice(1, 4), 'all three competency criteria recorded true').toEqual(['t', 't', 't'])
    expect(row[4]).toBe('APPROVED')
    expect(row[5], 'verification is e-signed').toBe('t')
  })

  test('rejecting for retraining → RETRAIN_REQUIRED plus a fresh retraining instance', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const instanceId = await instanceWithCompletedLearner(browser)
    await waitForAssigneeStatus(instanceId, 'COMPLETED')
    const assignee = findAssignee(instanceId)

    const ctx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const page = await ctx.newPage()
    const res = await verifyAssignees(page, instanceId, [assignee.id], {
      retrainingRequired: true,
      notes: 'E2E — could not demonstrate independently',
    })
    expect(res.ok()).toBeTruthy()
    await ctx.close()

    await waitForAssigneeStatus(instanceId, 'RETRAIN_REQUIRED')
    expect(sqlValue(`SELECT outcome FROM training_verifications WHERE training_assignee_id = '${assignee.id}'`))
      .toBe('RETRAIN_REQUIRED')

    // A retraining instance is spawned for the same learner.
    const retraining = sqlValue(
      `SELECT count(*) FROM training_instances ti
        JOIN training_assignees ta ON ta.training_instance_id = ti.id
       WHERE ti.training_id = '${TRAINING.id}' AND ti.is_retraining = true
         AND ta.user_id = '${USERS.learner.id}' AND ti.id <> '${instanceId}'`,
    )
    expect(Number(retraining), 'retraining instance launched for the learner').toBeGreaterThan(0)
  })

  test('negative: a non-manager cannot verify', async ({ browser }) => {
    test.setTimeout(120_000)
    const instanceId = await instanceWithCompletedLearner(browser)
    await waitForAssigneeStatus(instanceId, 'COMPLETED')
    const assignee = findAssignee(instanceId)

    // The learner is neither the training's manager_id nor the launcher.
    const ctx = await browser.newContext({ storageState: AUTH.learner })
    const page = await ctx.newPage()
    const res = await verifyAssignees(page, instanceId, [assignee.id])
    expect(res.ok(), 'a non-manager must not be able to verify').toBeFalsy()
    const body = await res.json().catch(() => null)
    expect(body?.error?.message ?? '').toMatch(/only the training manager/i)
    await ctx.close()

    // And the record is untouched.
    expect(findAssignee(instanceId).status).toBe('COMPLETED')
  })

  test('negative: a failed learner cannot be approved, only sent to retraining', async ({ browser }) => {
    test.setTimeout(120_000)
    // halfAnswers => 50, under the passing score, so the assignee lands FAILED.
    const instanceId = await instanceWithCompletedLearner(browser, TRAINING.halfAnswers)
    await waitForAssigneeStatus(instanceId, 'FAILED')
    const assignee = findAssignee(instanceId)

    const ctx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const page = await ctx.newPage()
    // FAILED with attempts remaining keeps the instance ACTIVE, so verify is
    // refused on instance state before it ever reaches the failed-assignee gate.
    const res = await verifyAssignees(page, instanceId, [assignee.id])
    expect(res.ok(), 'approving a failed learner must be refused').toBeFalsy()
    await ctx.close()

    expect(findAssignee(instanceId).status).toBe('FAILED')
  })
})
