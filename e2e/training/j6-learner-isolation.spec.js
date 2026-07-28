// PW-J6 · Learner isolation (P0, security).
//
// The counterpart to J5: J5 proves a learner cannot forge their OWN record;
// this proves they cannot see or reach anyone ELSE's, and that the RLS
// widening added for /my-training (training_instances self-scope) did not
// leak instances to users who are not assigned to them.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, COMPANY_ID, ALT_COMPANY_ID } from '../fixtures/cast.js'
import { sqlAsAppUser } from '../fixtures/db.js'
import { launchTraining, findAssignee } from '../fixtures/training.js'

test.describe('PW-J6 · learner isolation', () => {
  test('a learner sees only their own assignee rows, never a peer’s', async ({ browser }) => {
    test.setTimeout(90_000)
    const ctx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const page = await ctx.newPage()
    // One instance covering two different learners.
    const instanceId = await launchTraining(page, {
      userIds: [USERS.learner.id, USERS.author.id],
    })
    await ctx.close()

    const mine = findAssignee(instanceId, USERS.learner.id)
    const theirs = findAssignee(instanceId, USERS.author.id)
    expect(mine && theirs, 'both learners are assigned').toBeTruthy()

    const visible = sqlAsAppUser(
      `SELECT count(*) FROM training_assignees WHERE training_instance_id = '${instanceId}';`,
      { userId: USERS.learner.id, companyId: COMPANY_ID },
    )
    expect(visible.ok).toBe(true)
    expect(
      Number(visible.output.trim().split('\n').pop()),
      'the learner sees exactly their own row on this instance, not the peer’s',
    ).toBe(1)
  })

  test('the my-training RLS self-scope does not leak instances to non-assignees', async ({ browser }) => {
    test.setTimeout(90_000)
    const ctx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const page = await ctx.newPage()
    const instanceId = await launchTraining(page, { userIds: [USERS.learner.id] })
    await ctx.close()

    // noAccess holds no training grants and is not assigned — the clause added to
    // training_instances_select_rls must not expose this instance to them.
    const res = sqlAsAppUser(
      `SELECT count(*) FROM training_instances WHERE id = '${instanceId}';`,
      { userId: USERS.noAccess.id, companyId: COMPANY_ID },
    )
    expect(res.ok).toBe(true)
    expect(Number(res.output.trim().split('\n').pop()), 'not assigned → not visible').toBe(0)

    // The assigned learner does see it (the fix works in the intended direction).
    const asLearner = sqlAsAppUser(
      `SELECT count(*) FROM training_instances WHERE id = '${instanceId}';`,
      { userId: USERS.learner.id, companyId: COMPANY_ID },
    )
    expect(Number(asLearner.output.trim().split('\n').pop()), 'assigned → visible').toBe(1)
  })

  test('cross-tenant: an E2EALT user sees no E2ELAB training data', async ({ browser }) => {
    test.setTimeout(90_000)
    const ctx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const page = await ctx.newPage()
    const instanceId = await launchTraining(page)
    await ctx.close()

    // Same user id would be meaningless across tenants; what matters is that the
    // company_id predicate holds even for a user who IS assigned in the other one.
    const res = sqlAsAppUser(
      `SELECT count(*) FROM training_instances WHERE id = '${instanceId}';`,
      { userId: USERS.learner.id, companyId: ALT_COMPANY_ID },
    )
    expect(res.ok).toBe(true)
    expect(
      Number(res.output.trim().split('\n').pop()),
      'tenant predicate wins over the assignee self-scope',
    ).toBe(0)
  })

  test('a learner cannot open a peer’s my-training page', async ({ browser }) => {
    test.setTimeout(90_000)
    const ctx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const page = await ctx.newPage()
    // Instance assigned ONLY to the author persona.
    const peerInstance = await launchTraining(page, { userIds: [USERS.author.id] })
    await ctx.close()

    const learnerCtx = await browser.newContext({ storageState: AUTH.learner })
    const learnerPage = await learnerCtx.newPage()
    await learnerPage.goto(`/my-training/${peerInstance}`)
    // Not assigned → the instance is invisible → the page cannot resolve it.
    await expect(learnerPage.getByText(/not found/i).first()).toBeVisible({ timeout: 20_000 })
    await expect(learnerPage.getByRole('button', { name: 'Start Training' })).toHaveCount(0)
    await learnerCtx.close()
  })
})
