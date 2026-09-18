// Shared flows for the Training journeys.
//
// Training is architecturally unlike CAPA/NC/CR: no workflow engine, no
// reviewer picker, no Part-11 signature ledger. The lifecycle is
// launch (admin) -> start/answer/submit (learner) -> verify (manager),
// so these helpers are shaped around those three actors rather than around
// workflow steps.
import { expect } from '@playwright/test'
import { AUTH, USERS, COMPANY_ID, ESIGN_PIN, TRAINING } from './cast.js'
import { sqlRow, sqlValue, waitForSqlValue } from './db.js'

/**
 * Launch the seeded training as the training admin, returning the new
 * instance id. Goes through the real REST endpoint (the launch dialog is a
 * thin wrapper over it) so the instance, assignees and TRAINING task
 * instances are all created exactly as production would.
 *
 * @param {import('@playwright/test').Page} page  a trainingAdmin-authenticated page
 * @param {{userIds?: string[], reason?: string}} [opts]
 */
export async function launchTraining(page, { userIds = [USERS.learner.id], reason = 'E2E launch' } = {}) {
  const res = await page.request.post(`/api/v1/services/trainings/${TRAINING.id}/launch`, {
    data: { userIds, reason },
  })
  // 201 — launch creates a new instance (sendSuccess sets the created status).
  expect(res.status(), `launch should succeed: ${await res.text().catch(() => '')}`).toBe(201)
  const body = await res.json()
  const instanceId = body?.trainingInstance?.id
  expect(instanceId, 'launch response carries the new instance id').toBeTruthy()
  return instanceId
}

/** The learner's own assignee row for an instance. */
export function findAssignee(instanceId, userId = USERS.learner.id) {
  const row = sqlRow(
    `SELECT id, status, score, signed_at IS NOT NULL, signature_method, attempt_count
       FROM training_assignees
      WHERE training_instance_id = '${instanceId}' AND user_id = '${userId}'`,
  )
  if (!row) return null
  return {
    id: row[0],
    status: row[1],
    score: row[2] === '' ? null : Number(row[2]),
    signed: row[3] === 't',
    signatureMethod: row[4] || null,
    attemptCount: Number(row[5]),
  }
}

/** Instance status straight from the DB. */
export function instanceStatus(instanceId) {
  return sqlValue(`SELECT status FROM training_instances WHERE id = '${instanceId}'`)
}

/**
 * Drive the learner UI end to end: /my-training/:id -> Start -> material ->
 * assessment -> pick the given options -> Submit -> e-sign PIN.
 *
 * `answers` is a questionId -> optionId map (see TRAINING.correctAnswers). The
 * options render as plain <button>s carrying the option text, so we resolve the
 * text for each option id out of the seeded assessment rather than hardcoding
 * copy in two places.
 *
 * @param {import('@playwright/test').Page} page  a learner-authenticated page
 */
export async function completeTrainingViaUi(page, instanceId, answers) {
  await page.goto(`/my-training/${instanceId}`)

  // Step 1 — instructions. "Start Training" only shows while the assignee is
  // still ASSIGNED; a resumed session lands on "Continue to Material".
  const start = page.getByRole('button', { name: 'Start Training' })
  const cont = page.getByRole('button', { name: 'Continue to Material' })
  await expect(start.or(cont).first()).toBeVisible({ timeout: 20_000 })
  if (await start.isVisible().catch(() => false)) {
    await start.click()
  } else {
    await cont.click()
  }

  // Step 2 — material. The Proceed button is gated on allMaterialViewed; the
  // seeded training links no documents, so it is enabled immediately.
  const proceed = page.getByRole('button', { name: 'Proceed to Assessment' })
  await expect(proceed).toBeEnabled({ timeout: 20_000 })
  await proceed.click()

  // Step 3 — answer. Click the option button whose visible text matches.
  for (const [questionId, optionId] of Object.entries(answers)) {
    await page.getByRole('button', { name: optionText(questionId, optionId), exact: true }).click()
  }

  await page.getByRole('button', { name: 'Submit Assessment' }).click()
  await signEsign(page)
}

/** Resolve an option's display text from the seeded assessment JSON. */
function optionText(questionId, optionId) {
  const text = sqlValue(
    `SELECT o->>'text'
       FROM trainings t,
            jsonb_array_elements(t.assessment) q,
            jsonb_array_elements(q->'options') o
      WHERE t.id = '${TRAINING.id}'
        AND q->>'id' = '${questionId}'
        AND o->>'id' = '${optionId}'`,
  )
  expect(text, `option ${questionId}/${optionId} exists in the seeded assessment`).toBeTruthy()
  return text
}

/**
 * Fill the shared WorkflowInstanceEsignAuthDialog. Same retry-fill shape the
 * CAPA/CR helpers use: the Sign button enables off a debounced validity check,
 * so a single fill can race it.
 */
export async function signEsign(page) {
  const pin = page.getByPlaceholder('Enter your e-signature PIN')
  await expect(pin).toBeVisible({ timeout: 15_000 })
  const signBtn = page.getByRole('button', { name: 'Sign', exact: true })
  await expect(async () => {
    await pin.fill(ESIGN_PIN)
    await expect(signBtn).toBeEnabled({ timeout: 3_000 })
  }).toPass({ timeout: 15_000 })
  await signBtn.click()
}

/** Wait for an assignee to reach a status (submit -> grade is a round trip). */
export async function waitForAssigneeStatus(instanceId, status, userId = USERS.learner.id) {
  await waitForSqlValue(
    `SELECT count(*) FROM training_assignees
      WHERE training_instance_id = '${instanceId}' AND user_id = '${userId}' AND status = '${status}'`,
    { timeoutMs: 30_000, label: `assignee ${status}` },
  )
}

/**
 * Manager competency verification via the real endpoint. The three criteria are
 * all required for an APPROVED outcome; `retrainingRequired` flips it to
 * RETRAIN_REQUIRED and spawns a retraining instance.
 *
 * @param {import('@playwright/test').Page} page  a trainingAdmin-authenticated page
 */
export async function verifyAssignees(page, instanceId, assigneeIds, { retrainingRequired = false, notes = 'E2E verification' } = {}) {
  return page.request.post(`/api/v1/services/trainingInstances/${instanceId}/verify`, {
    data: {
      assigneeIds,
      demonstratedUnderstanding: !retrainingRequired,
      canPerformIndependently: !retrainingRequired,
      practicalObservationCompleted: !retrainingRequired,
      retrainingRequired,
      notes,
      signatureMethod: 'PIN',
    },
  })
}

/** Company id for the seeded tenant — re-exported so specs import one module. */
export const TRAINING_COMPANY_ID = COMPANY_ID

/** Convenience: the storageState paths these journeys use. */
export const TRAINING_AUTH = {
  admin: AUTH.trainingAdmin,
  learner: AUTH.learner,
}
