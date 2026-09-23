// TRN-J12 · The configured maximum number of attempts is enforced — OQ-02
// TC-02-06 (URS-TRN-06).
//
// The gap this file closes, verbatim from the coverage matrix: "Exhausting the
// maximum attempts and being refused is not tested." PW-J1's second test fails
// ONCE and stops there — it asserts `attemptCount === 1` and that the instance
// is still ACTIVE, i.e. that a retry *remains*. Nothing anywhere walks the
// counter to the configured ceiling and asks for one more.
//
// ── WHERE THE LIMIT ACTUALLY LIVES ──────────────────────────────────────────
// Read from primary sources, not assumed, because "the Retry button
// disappears" would be an interface control and TC-02-06 step 4 wants a
// refusal:
//
//   · `submitAssessment` (controllers/trainingInstances.js:206-209):
//
//         const maxAttempts = instance.snapshot?.maxAttempts ?? 1
//         if (assignee.status === 'FAILED' && assignee.attemptCount >= maxAttempts) {
//           throw new BadRequestError('Maximum attempts reached')
//         }
//
//   · `startTraining` (same file, :117-120) carries the SAME guard with the
//     same ceiling, so a learner cannot even re-open the attempt to try again.
//     Both arms are exercised below — a fix that removed one and left the other
//     would otherwise pass.
//
// Two properties of that predicate are load-bearing and are pinned separately,
// because each is a way the guard could rot into a no-op without any test
// noticing:
//
//   1. **It reads the INSTANCE SNAPSHOT, not the training row.** `maxAttempts`
//      is frozen at launch (controllers/trainings.js:195). Editing the template
//      afterwards cannot widen a live cohort's ceiling — which is the whole
//      point of snapshotting, and is asserted here rather than assumed.
//   2. **It is conditioned on `status === 'FAILED'`.** That is correct today
//      (a pass is caught one line earlier by the `COMPLETED` check) but it
//      means the ceiling is enforced by TWO cooperating conditions. The arm
//      that submits from an exhausted FAILED row is what proves the pair.
//
// ── WHY THIS FILE DRIVES REST, NOT THE LEARNER UI ───────────────────────────
// Deliberate, and worth stating because every other training journey here uses
// `completeTrainingViaUi`. Three reasons, in order of weight:
//
//   1. The refusal under test is a SERVER refusal. TC-02-06 step 4 says
//      "Further attempts are refused" — an absent Retry button is the weaker
//      half of that, so the UI arm below is included as a *second* layer on top
//      of the HTTP arms, never as a substitute for them.
//   2. Exhausting a 2-attempt ceiling means two full signed submissions, and
//      `completeTrainingViaUi` is currently unreliable under suite load — the
//      four PW-J2 tests, which are the only other multi-completion flow here,
//      fail on `develop` today for exactly that reason (their learner contexts
//      stall at IN_PROGRESS and never submit; observed 2026-09-23, four
//      instances left mid-flow). Building a ceiling test on that flow would
//      make it fail for a cause that is not the ceiling.
//   3. `submitAssessment` refuses from ANY pre-terminal state, /start included
//      or omitted (see TRN-J11's header on the `ASSIGNED->COMPLETED` trusted
//      edge). A REST submit is therefore not a shortcut around the product's
//      own rules; it is the same write the UI's Submit button performs.
//
// The seeded TRAINING has `maxAttempts: 2` and a 2-question assessment where
// `TRAINING.halfAnswers` scores 50 against a passing score of 70 — so two
// deliberate failures reach the ceiling exactly, with nothing to tune.
//
// Measured 2026-09-23 against the live local stack (app-db + api :4000).
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, ESIGN_PIN, TRAINING } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import { launchTraining, findAssignee, waitForAssigneeStatus, instanceStatus } from '../fixtures/training.js'

/** The e-sign body every signing path in the product speaks: { method, token }. */
const ESIGN = { method: 'PIN', token: ESIGN_PIN }

const submitUrl = (instanceId) => `/api/v1/services/trainingInstances/${instanceId}/submit`
const startUrl = (instanceId) => `/api/v1/services/trainingInstances/${instanceId}/start`

/**
 * One signed, deliberately-failing attempt through the real endpoint.
 * `halfAnswers` is one right and one wrong → 50, under the passing score of 70.
 */
async function failOnce(learnerCtx, instanceId) {
  return learnerCtx.request.post(submitUrl(instanceId), {
    data: { answers: TRAINING.halfAnswers, esign: ESIGN },
  })
}

/** A fresh instance of the seeded training, launched to the learner. */
async function launchToLearner(browser) {
  const adminCtx = await browser.newContext({ storageState: AUTH.trainingAdmin })
  const adminPage = await adminCtx.newPage()
  const instanceId = await launchTraining(adminPage)
  await adminCtx.close()
  return instanceId
}

test.describe('TRN-J12 · the configured attempt limit is enforced at the ceiling', () => {
  test('TC-02-06 steps 1-2 · the ceiling under test is the SNAPSHOT’s, frozen at launch', async ({
    browser,
  }) => {
    // Step 1 asks the executor to "record the configured maximum attempts".
    // Recording it from the template would be recording the wrong number: the
    // guard reads `instance.snapshot.maxAttempts`, so a divergence between the
    // template and the snapshot would make every later arm measure something
    // other than what the product enforces. Pin both and pin that they agree.
    test.setTimeout(90_000)
    const instanceId = await launchToLearner(browser)

    const templateMax = sqlValue(`SELECT max_attempts FROM trainings WHERE id = '${TRAINING.id}'`)
    const snapshotMax = sqlValue(
      `SELECT snapshot->>'maxAttempts' FROM training_instances WHERE id = '${instanceId}'`,
    )

    expect(Number(templateMax), 'the seeded template configures a 2-attempt ceiling').toBe(
      TRAINING.maxAttempts,
    )
    expect(
      Number(snapshotMax),
      'launch froze that ceiling into the instance snapshot — this is the value submitAssessment reads',
    ).toBe(TRAINING.maxAttempts)

    // And the passing score the failures below rely on, from the same snapshot.
    expect(
      Number(sqlValue(`SELECT snapshot->>'passingScore' FROM training_instances WHERE id = '${instanceId}'`)),
      'halfAnswers (50) must sit below the passing score for a failure to be a failure',
    ).toBe(TRAINING.passingScore)
  })

  test('TC-02-06 steps 2-5 · attempts are counted, a retry is offered until the ceiling, and the attempt beyond it is REFUSED', async ({
    browser,
  }) => {
    // The core arm, and it walks the whole of TC-02-06 in one place on purpose:
    // the ceiling is a property of a SEQUENCE, and splitting the sequence
    // across tests would leave each half asserting a state it did not itself
    // produce. (Playwright restarts a worker after a failure and re-runs
    // beforeAll — see e2e/README.md's harness note — so shared multi-attempt
    // setup across tests is exactly the shape that misreports its own cause.)
    test.setTimeout(150_000)
    const instanceId = await launchToLearner(browser)
    const learnerCtx = await browser.newContext({ storageState: AUTH.learner })

    try {
      // ── Attempt 1 of 2 — fails, and a retry REMAINS (step 2). ────────────
      const first = await failOnce(learnerCtx, instanceId)
      expect(first.ok(), `attempt 1 must be accepted and graded — ${await first.text()}`).toBe(true)
      const firstBody = await first.json()
      expect(firstBody.passed, 'halfAnswers is a deliberate failure').toBe(false)
      expect(firstBody.score, 'one of two correct → 50').toBe(50)

      await waitForAssigneeStatus(instanceId, 'FAILED')
      let assignee = findAssignee(instanceId)
      expect(assignee.attemptCount, 'attempt 1 is counted').toBe(1)
      expect(
        assignee.attemptCount < TRAINING.maxAttempts,
        'a retry remains while the count is under the ceiling',
      ).toBe(true)
      expect(
        instanceStatus(instanceId),
        'the instance stays ACTIVE while the learner still has an attempt',
      ).toBe('ACTIVE')

      // The retry is genuinely available at the server, not merely un-hidden:
      // /start is the route the Retry button calls, and it carries its own copy
      // of the ceiling guard.
      const restart = await learnerCtx.request.post(startUrl(instanceId))
      expect(
        restart.ok(),
        `a retry must be startable while attempts remain — ${await restart.text()}`,
      ).toBe(true)

      // ── Attempt 2 of 2 — fails, and the ceiling is now REACHED (step 3). ──
      const second = await failOnce(learnerCtx, instanceId)
      expect(second.ok(), `attempt 2 must still be accepted — ${await second.text()}`).toBe(true)
      expect((await second.json()).passed).toBe(false)

      await expect(async () => {
        expect(findAssignee(instanceId).attemptCount).toBe(TRAINING.maxAttempts)
      }).toPass({ timeout: 20_000 })

      assignee = findAssignee(instanceId)
      expect(assignee.status, 'still FAILED — the ceiling does not change the outcome').toBe('FAILED')
      expect(assignee.attemptCount, 'attempts are counted correctly up to the ceiling').toBe(
        TRAINING.maxAttempts,
      )

      // ── Attempt 3 — BEYOND the ceiling. This is step 4. ──────────────────
      const beyond = await failOnce(learnerCtx, instanceId)
      expect(
        beyond.status(),
        `a further attempt must be refused (got ${beyond.status()}: ${await beyond
          .text()
          .catch(() => '')})`,
      ).toBe(400)
      expect(
        (await beyond.text()).toLowerCase(),
        'and refused for the RIGHT reason — not a stray validation or auth error',
      ).toContain('maximum attempts')

      // ── …and nothing moved. A refusal that still wrote would be worse than
      // no refusal at all: the counter would drift past the ceiling and the
      // record would carry an attempt nobody was allowed to make.
      const after = findAssignee(instanceId)
      expect(after.attemptCount, 'the refused attempt was NOT counted').toBe(TRAINING.maxAttempts)
      expect(after.status, 'the refused attempt did not change the outcome').toBe('FAILED')
      expect(after.score, 'the refused attempt did not rewrite the recorded score').toBe(50)

      // ── The OTHER guard. /start carries the same ceiling, so a learner
      // cannot re-open the attempt and come at /submit from IN_PROGRESS. A fix
      // that removed this one and kept only the submit-side check would leave
      // the UI offering a dead Retry; a fix that removed the submit-side one
      // would be a hole. Both are pinned.
      const reopen = await learnerCtx.request.post(startUrl(instanceId))
      expect(
        reopen.status(),
        `re-opening an exhausted training must be refused too (got ${reopen.status()})`,
      ).toBe(400)
      expect((await reopen.text()).toLowerCase()).toContain('maximum attempts')
      expect(
        findAssignee(instanceId).status,
        'the refused re-open did not flip the row back to IN_PROGRESS',
      ).toBe('FAILED')

      // ── Step 5 · "Confirm the failed attempts are recorded against the
      // trainee." The product keeps ONE assignee row per learner per instance
      // and increments `attempt_count` on it — there is no per-attempt table,
      // so "all attempts are in the record" means the counter and the final
      // score, not a list of rows. Stated plainly rather than asserted as a
      // row count that would read as richer evidence than it is.
      expect(
        Number(
          sqlValue(
            `SELECT count(*) FROM training_assignees
              WHERE training_instance_id = '${instanceId}' AND user_id = '${USERS.learner.id}'`,
          ),
        ),
        'one assignee row carries the whole attempt record',
      ).toBe(1)
      expect(
        sqlValue(
          `SELECT signed_at IS NOT NULL FROM training_assignees
            WHERE training_instance_id = '${instanceId}' AND user_id = '${USERS.learner.id}'`,
        ),
        'the last attempt is e-signed — a failed attempt is a signed record too',
      ).toBe('t')

      // The instance's own task is cancelled once the ceiling is spent — the
      // learner is not left holding an actionable task they can never satisfy.
      await expect(async () => {
        expect(
          sqlValue(
            `SELECT status_id FROM task_instances
              WHERE entity_type = 'TrainingAssignee' AND entity_id = '${after.id}'`,
          ),
        ).toBe('CANCELLED')
      }).toPass({ timeout: 20_000 })
    } finally {
      await learnerCtx.close()
    }
  })

  test('TC-02-06 step 4 · INTERFACE: the exhausted learner is shown the lock-out, and offered no Retry', async ({
    browser,
  }) => {
    // The second layer, and explicitly the weaker one. An absent button proves
    // only that the product does not INVITE a further attempt; the arm above is
    // what proves one is refused. Both belong in the record, in that order.
    test.setTimeout(150_000)
    const instanceId = await launchToLearner(browser)
    const learnerCtx = await browser.newContext({ storageState: AUTH.learner })

    try {
      // Spend the ceiling over REST (the sequence itself is under test above).
      for (let i = 0; i < TRAINING.maxAttempts; i += 1) {
        const res = await failOnce(learnerCtx, instanceId)
        expect(res.ok(), `setup: attempt ${i + 1} should be graded — ${await res.text()}`).toBe(true)
      }
      await expect(async () => {
        expect(findAssignee(instanceId).attemptCount).toBe(TRAINING.maxAttempts)
      }).toPass({ timeout: 20_000 })

      const page = await learnerCtx.newPage()
      await page.goto(`/my-training/${instanceId}`)

      // The page opens on 'instructions', and `isLockedOut` (attemptCount >=
      // maxAttempts on a FAILED row) replaces the entry action entirely: there
      // is no "Start Training" and no "Continue to Material", only "View
      // Results". That absence is the interface half of the refusal — the
      // learner is given no way back INTO the assessment.
      const viewResults = page.getByRole('button', { name: 'View Results' })
      await expect(viewResults).toBeVisible({ timeout: 25_000 })
      await expect(page.getByRole('button', { name: 'Start Training' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Continue to Material' })).toHaveCount(0)

      // The read-only review reports the spent ceiling in the product's own
      // words. Anchored on the attempt/ceiling line rather than on "Failed"
      // alone, which also appears on a still-retryable failure.
      await viewResults.click()
      await expect(
        page.getByText(`Final attempt ${TRAINING.maxAttempts} of ${TRAINING.maxAttempts}`),
      ).toBeVisible({ timeout: 25_000 })

      // `canRetry` is false once attemptCount >= maxAttempts, so the button the
      // retryable path renders must be absent.
      await expect(page.getByRole('button', { name: 'Retry Assessment' })).toHaveCount(0)

      // And no fresh submit affordance either — the assessment is read-only.
      await expect(page.getByRole('button', { name: 'Submit Assessment' })).toHaveCount(0)
    } finally {
      await learnerCtx.close()
    }
  })

  test('the ceiling does not leak across cohorts — a NEW launch gives the same learner a fresh count', async ({
    browser,
  }) => {
    // The control, and the reason it is here: every arm above asserts a
    // REFUSAL, and a product that refused every submit outright would satisfy
    // all of them. This proves the refusal is scoped to the exhausted instance
    // — the same learner, the same training, a new launch, and the first
    // attempt is graded normally.
    //
    // It is also the real-world path out of a lock-out: TC-02-08 step 6's
    // retraining launch works precisely because the counter lives on the
    // assignee row of one instance, not on the person.
    test.setTimeout(150_000)
    const exhausted = await launchToLearner(browser)
    const learnerCtx = await browser.newContext({ storageState: AUTH.learner })

    try {
      for (let i = 0; i < TRAINING.maxAttempts; i += 1) {
        expect((await failOnce(learnerCtx, exhausted)).ok()).toBe(true)
      }
      await expect(async () => {
        expect(findAssignee(exhausted).attemptCount).toBe(TRAINING.maxAttempts)
      }).toPass({ timeout: 20_000 })
      expect((await failOnce(learnerCtx, exhausted)).status(), 'premise: this one IS spent').toBe(400)

      // A fresh cohort for the same person.
      const fresh = await launchToLearner(browser)
      expect(findAssignee(fresh).attemptCount, 'a new launch starts the count at zero').toBe(0)

      const res = await learnerCtx.request.post(submitUrl(fresh), {
        data: { answers: TRAINING.correctAnswers, esign: ESIGN },
      })
      expect(
        res.ok(),
        `the new instance must accept a first attempt — ${await res.text().catch(() => '')}`,
      ).toBe(true)
      expect((await res.json()).passed, 'and grade it on its merits').toBe(true)

      await expect(async () => {
        expect(findAssignee(fresh).attemptCount).toBe(1)
      }).toPass({ timeout: 20_000 })
      expect(
        findAssignee(exhausted).attemptCount,
        'the exhausted instance is untouched by the new one',
      ).toBe(TRAINING.maxAttempts)
    } finally {
      await learnerCtx.close()
    }
  })
})
