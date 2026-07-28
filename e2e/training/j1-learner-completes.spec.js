// PW-J1 · Learner completes training end-to-end (P0).
//
// The learner persona holds NO training permissions at all — /my-training/:id is
// the one training surface with no route guard (RLS self-scope only), so this
// journey doubles as proof that a permission-less user can still complete an
// assignment routed to them.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, TRAINING } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import {
  launchTraining,
  completeTrainingViaUi,
  findAssignee,
  waitForAssigneeStatus,
  instanceStatus,
} from '../fixtures/training.js'

test.describe('PW-J1 · learner completes an assigned training', () => {
  test('ASSIGNED → IN_PROGRESS → COMPLETED, scored and e-signed', async ({ browser }) => {
    test.setTimeout(90_000)

    const adminCtx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const adminPage = await adminCtx.newPage()
    const instanceId = await launchTraining(adminPage)
    await adminCtx.close()

    // Launch creates the assignee AND the TRAINING task that routes the learner here.
    expect(findAssignee(instanceId).status).toBe('ASSIGNED')
    const taskCount = sqlValue(
      `SELECT count(*) FROM task_instances
        WHERE entity_type = 'TrainingAssignee' AND entity_id = '${findAssignee(instanceId).id}'
          AND assigned_to = '${USERS.learner.id}' AND task_kind_id = 'TRAINING'`,
    )
    expect(Number(taskCount), 'a TRAINING task is routed to the learner').toBe(1)

    const learnerCtx = await browser.newContext({ storageState: AUTH.learner })
    const learnerPage = await learnerCtx.newPage()
    await completeTrainingViaUi(learnerPage, instanceId, TRAINING.correctAnswers)

    await waitForAssigneeStatus(instanceId, 'COMPLETED')
    const done = findAssignee(instanceId)
    expect(done.score, 'both answers correct → 100').toBe(100)
    expect(done.signed, 'completion carries an inline e-signature stamp').toBe(true)
    expect(done.signatureMethod).toBeTruthy()
    expect(done.attemptCount).toBe(1)

    // The result screen confirms the pass to the learner.
    await expect(learnerPage.getByText(/100/).first()).toBeVisible({ timeout: 15_000 })
    await learnerCtx.close()

    // requireManagerVerification=true on the seeded training, so finishing the
    // last assignee moves the INSTANCE to PENDING_VERIFICATION rather than
    // straight to COMPLETED — that is what queues the manager (PW-J2).
    expect(instanceStatus(instanceId)).toBe('PENDING_VERIFICATION')

    // KNOWN GAP (inventory §M / security review #3): training e-signatures are
    // inline columns only — training has no subject column on the central
    // Part-11 `signatures` ledger, unlike CAPA/NC/CR. Asserted so the day a
    // training subject is added, this flips and the doc gets updated with it.
    const ledgerRows = sqlValue(
      `SELECT count(*) FROM information_schema.columns
        WHERE table_name = 'signatures' AND column_name LIKE '%training%'`,
    )
    expect(
      Number(ledgerRows),
      'documents the Part-11 gap: no training subject on the signatures ledger',
    ).toBe(0)
  })

  test('a failing score does not complete the training and leaves a retry', async ({ browser }) => {
    test.setTimeout(90_000)

    const adminCtx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const adminPage = await adminCtx.newPage()
    const instanceId = await launchTraining(adminPage)
    await adminCtx.close()

    const learnerCtx = await browser.newContext({ storageState: AUTH.learner })
    const learnerPage = await learnerCtx.newPage()
    // One right, one wrong → 50, under the passing score of 70.
    await completeTrainingViaUi(learnerPage, instanceId, TRAINING.halfAnswers)

    await waitForAssigneeStatus(instanceId, 'FAILED')
    const failed = findAssignee(instanceId)
    expect(failed.score).toBe(50)
    expect(failed.attemptCount).toBe(1)
    // maxAttempts is 2, so a retry is still available and the instance stays open.
    expect(instanceStatus(instanceId)).toBe('ACTIVE')
    await learnerCtx.close()
  })
})
