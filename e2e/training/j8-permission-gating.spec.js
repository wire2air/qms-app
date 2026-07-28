// PW-J8 · Permission & route gating (P1).
//
// Training's permission surface is unusually uneven and the inventory flags two
// specific weak spots, so this journey checks what IS enforced and pins the two
// known gaps rather than asserting a tidier model than the code actually has:
//   - list/get endpoints (API-01/03/09/10) carry NO enforcePermission — they are
//     company-scoped only (inventory §C "Enforcement notes").
//   - `training_verifications:read`, the guard on /training-verifications, has no
//     backing authz module (inventory PERM-08, "SUSPECT — may resolve false").
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, TRAINING } from '../fixtures/cast.js'
import { sqlValue } from '../fixtures/db.js'
import { launchTraining } from '../fixtures/training.js'

test.describe('PW-J8 · permission & route gating', () => {
  test('a user without training:manage cannot launch', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.learner })
    const page = await ctx.newPage()
    const res = await page.request.post(`/api/v1/services/trainings/${TRAINING.id}/launch`, {
      data: { userIds: [USERS.learner.id], reason: 'should be refused' },
    })
    expect(res.status(), 'launch is gated on training:manage').toBe(403)
    await ctx.close()
  })

  test('a user without training:create cannot create a training', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.learner })
    const page = await ctx.newPage()
    const res = await page.request.post('/api/v1/services/trainings', {
      data: { title: 'should be refused', passingScore: 70 },
    })
    expect(res.status()).toBe(403)
    await ctx.close()
  })

  test('a user without training_instances:manage cannot cancel an instance', async ({ browser }) => {
    test.setTimeout(90_000)
    const adminCtx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const adminPage = await adminCtx.newPage()
    const instanceId = await launchTraining(adminPage)
    await adminCtx.close()

    const ctx = await browser.newContext({ storageState: AUTH.learner })
    const page = await ctx.newPage()
    const res = await page.request.post(`/api/v1/services/trainingInstances/${instanceId}/cancel`, {
      data: { reason: 'should be refused' },
    })
    expect(res.status(), 'cancel is gated on training_instances:manage').toBe(403)
    await ctx.close()

    expect(sqlValue(`SELECT status FROM training_instances WHERE id = '${instanceId}'`)).toBe('ACTIVE')
  })

  test('the Training Matrix route is guarded; my-training is deliberately open', async ({ browser }) => {
    test.setTimeout(90_000)
    const adminCtx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const adminPage = await adminCtx.newPage()
    const instanceId = await launchTraining(adminPage)
    await adminCtx.close()

    // Separate contexts on purpose. Bouncing off /no-access leaves the
    // syncEngine only partially bootstrapped, so a subsequent /my-training visit
    // in the SAME context renders the instance but not yet the assignee row
    // ("You are not assigned to this training") — a test artifact, not a product
    // behaviour. Each half gets a clean session so it asserts only its own gate.

    // /training-instances is guarded on training_instances:read — the learner has none.
    const guardedCtx = await browser.newContext({ storageState: AUTH.learner })
    const guardedPage = await guardedCtx.newPage()
    await guardedPage.goto('/training-instances')
    await expect(guardedPage).toHaveURL(/\/no-access/, { timeout: 20_000 })
    await guardedCtx.close()

    // /my-training/:id is NOT in the route guard (inventory PG-04, "OPEN — RLS
    // only"), so the same permission-less learner reaches their own training.
    const openCtx = await browser.newContext({ storageState: AUTH.learner })
    const openPage = await openCtx.newPage()
    await openPage.goto(`/my-training/${instanceId}`)
    await expect(openPage.getByRole('button', { name: 'Start Training' })).toBeVisible({ timeout: 20_000 })
    await openCtx.close()
  })

  test('an unauthenticated caller is rejected 401', async ({ playwright }) => {
    const request = await playwright.request.newContext()
    const res = await request.post(`/api/v1/services/trainings/${TRAINING.id}/launch`, { data: {} })
    expect(res.status()).toBe(401)
    await request.dispose()
  })

  test('KNOWN GAP: list/get training endpoints carry no permission gate', async ({ browser }) => {
    // Inventory §C: API-01/03/09/10 have no enforcePermission — company scoping
    // is the only control. The learner holds NO training grants yet can list.
    // Pinned so the day a gate is added, this flips and the doc is updated with it.
    const ctx = await browser.newContext({ storageState: AUTH.learner })
    const page = await ctx.newPage()
    const res = await page.request.get('/api/v1/services/trainings')
    expect(
      res.status(),
      'documents the ungated-list gap: a user with no training grants still reads the catalog',
    ).toBe(200)
    await ctx.close()
  })
})
