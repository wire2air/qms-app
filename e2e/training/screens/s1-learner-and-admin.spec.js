// Training screenshots · S1 — the learner path and the admin surfaces.
//   Admin: the trainings list, the launched instance on /training-instances.
//   Learner: /my-training/:id — instructions → material → assessment →
//   e-signature → the completed result.
//   Denials: /training-instances is guarded (learner → /no-access), while
//   /my-training/:id is deliberately open to the same permission-less learner
//   (RLS self-scope only — inventory PG-04).
// Flow and selectors mirror PW-J1 / PW-J8.
import { test, expect } from '../../../video/fixtures/videoTest.js'
import { AUTH, TRAINING, USERS } from '../../fixtures/cast.js'
import {
  launchTraining,
  waitForAssigneeStatus,
  signEsign,
  findAssignee,
} from '../../fixtures/training.js'
import { sqlValue } from '../../fixtures/db.js'
import { shooter } from '../../fixtures/screenshots.js'

const shot = shooter('training')

test.describe.serial('Training screenshots · launch → learn → verify', () => {
  let instanceId

  test('admin surfaces: trainings list and the launched instance', async ({ browser }) => {
    test.setTimeout(240_000)
    const ctx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const page = await ctx.newPage()

    await page.goto('/trainings')
    await expect(page.getByText(TRAINING.title).first()).toBeVisible({ timeout: 30_000 })
    await shot(page, 'trainings-list')

    await page.goto(`/trainings/${TRAINING.id}`)
    await expect(page.getByText(TRAINING.title).first()).toBeVisible({ timeout: 30_000 })
    await shot(page, 'training-detail')

    // Launch through the REST endpoint the dialog wraps (fixture behaviour),
    // then show the instance it created.
    instanceId = await launchTraining(page, { userIds: [USERS.learner.id] })
    await page.goto('/training-instances')
    await expect(page.getByText(TRAINING.title).first()).toBeVisible({ timeout: 30_000 })
    await shot(page, 'training-instances-list')

    await page.goto(`/training-instances/${instanceId}`)
    await expect(page.getByText(TRAINING.title).first()).toBeVisible({ timeout: 30_000 })
    await shot(page, 'training-instance-detail')

    await ctx.close()
  })

  test('learner path: instructions → material → assessment → e-sign → result', async ({
    browser,
  }) => {
    test.setTimeout(300_000)
    const ctx = await browser.newContext({ storageState: AUTH.learner })
    const page = await ctx.newPage()

    await page.goto(`/my-training/${instanceId}`)
    const start = page.getByRole('button', { name: 'Start Training' })
    const cont = page.getByRole('button', { name: 'Continue to Material' })
    await expect(start.or(cont).first()).toBeVisible({ timeout: 30_000 })
    await shot(page, 'my-training-instructions')

    if (await start.isVisible().catch(() => false)) {
      await start.click()
    } else {
      await cont.click()
    }

    const proceed = page.getByRole('button', { name: 'Proceed to Assessment' })
    await expect(proceed).toBeEnabled({ timeout: 30_000 })
    await shot(page, 'my-training-material')
    await proceed.click()

    await expect(page.getByRole('button', { name: 'Submit Assessment' })).toBeVisible({
      timeout: 30_000,
    })
    await shot(page, 'my-training-assessment')

    // Answer every question correctly (the seeded assessment's key).
    for (const [questionId, optionId] of Object.entries(TRAINING.correctAnswers)) {
      await page.getByRole('button', { name: optionTextOf(questionId, optionId) }).click()
    }
    await shot(page, 'my-training-assessment-answered')

    await page.getByRole('button', { name: 'Submit Assessment' }).click()
    await expect(page.getByPlaceholder('Enter your e-signature PIN')).toBeVisible({
      timeout: 30_000,
    })
    await shot(page, 'my-training-esign-dialog')
    await signEsign(page)

    await waitForAssigneeStatus(instanceId, 'COMPLETED')
    expect(findAssignee(instanceId).score, 'all answers correct').toBe(100)
    await expect(page.getByText(/100/).first()).toBeVisible({ timeout: 30_000 })
    await shot(page, 'my-training-completed')

    await ctx.close()
  })

  test('denials: guarded instances list vs the open self-service page', async ({ browser }) => {
    test.setTimeout(180_000)

    // The learner holds NO training grants — /training-instances is guarded…
    const guarded = await browser.newContext({ storageState: AUTH.learner })
    const guardedPage = await guarded.newPage()
    await guardedPage.goto('/training-instances')
    await expect(guardedPage).toHaveURL(/\/no-access/, { timeout: 30_000 })
    await shot(guardedPage, 'no-access')
    await guarded.close()

    const anon = await browser.newContext() // no session
    const anonPage = await anon.newPage()
    await anonPage.goto('/training-instances')
    await expect(anonPage).toHaveURL(/\/signin/, { timeout: 30_000 })
    await shot(anonPage, 'signin-redirect')
    await anon.close()
  })
})

/**
 * Option text for a seeded question/option pair. The learner UI renders options
 * as plain buttons carrying their text, and the copy lives only in the seed —
 * so resolve it there rather than hardcoding it in a second place (same reason
 * fixtures/training.js does).
 */
function optionTextOf(questionId, optionId) {
  return sqlValue(
    `SELECT o->>'text'
       FROM trainings t,
            jsonb_array_elements(t.assessment) q,
            jsonb_array_elements(q->'options') o
      WHERE t.id = '${TRAINING.id}'
        AND q->>'id' = '${questionId}'
        AND o->>'id' = '${optionId}'`,
  )
}
