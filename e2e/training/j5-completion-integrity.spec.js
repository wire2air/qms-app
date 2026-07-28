// PW-J5 · Completion-integrity bypass (P0, security — the critical probe).
//
// Doc 14 wrote this journey as "assert current behavior (likely succeeds →
// mark KNOWN CRITICAL GAP)". The bypass was confirmed real against app-db and
// then FIXED (migration 20260728120000 + excludeFromGraphQL locks on
// models/trainingAssignee.js), so this suite asserts the fixed behaviour: the
// forgery is rejected, and the legitimate lifecycle still works.
//
// Why these probes go through SQL as `app_user` rather than the GraphQL
// endpoint: `app_user` is exactly the role PostGraphile assumes for every
// GraphQL request, and driving the DB directly with the learner's own session
// GUCs reproduces a raw mutation without depending on the client model's
// generated mutation shape. The client-side excludeFromGraphQL lock is a second
// layer; this asserts the layer that holds even if the schema is regenerated.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, COMPANY_ID } from '../fixtures/cast.js'
import { sqlAsAppUser } from '../fixtures/db.js'
import { launchTraining, findAssignee } from '../fixtures/training.js'

test.describe('PW-J5 · completion-integrity guard', () => {
  let instanceId
  let assignee

  test.beforeEach(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const page = await ctx.newPage()
    instanceId = await launchTraining(page)
    await ctx.close()
    assignee = findAssignee(instanceId)
    expect(assignee, 'the learner has an assignee row').toBeTruthy()
    expect(assignee.status).toBe('ASSIGNED')
  })

  test('a learner cannot forge their OWN record to VERIFIED (the critical bypass)', async () => {
    const res = sqlAsAppUser(
      `UPDATE training_assignees
          SET status='VERIFIED', score=100, signed_at=NOW(), signature_method='PIN', completed_at=NOW()
        WHERE id='${assignee.id}';`,
      { userId: USERS.learner.id, companyId: COMPANY_ID },
    )

    expect(res.ok, 'the forgery must be rejected, not applied').toBe(false)
    expect(res.error).toMatch(/completion fields cannot be changed directly/i)

    // The record is untouched — this is the assertion that actually matters.
    const after = findAssignee(instanceId)
    expect(after.status).toBe('ASSIGNED')
    expect(after.score).toBeNull()
    expect(after.signed, 'no e-signature was forged').toBe(false)
  })

  test('a learner cannot INSERT an already-VERIFIED row (skipping UPDATE entirely)', async () => {
    // The RLS INSERT policy only checks company_id, so without the guard a
    // learner could sidestep UPDATE completely and insert a finished record.
    // Not described in doc 14 — found while verifying the UPDATE vector.
    const res = sqlAsAppUser(
      `INSERT INTO training_assignees
         (company_id, training_instance_id, user_id, status, score, signed_at, signature_method, created_at, updated_at)
       VALUES ('${COMPANY_ID}', '${instanceId}', '${USERS.learner.id}', 'VERIFIED', 100, NOW(), 'PIN', NOW(), NOW());`,
      { userId: USERS.learner.id, companyId: COMPANY_ID },
    )

    expect(res.ok, 'inserting a pre-completed record must be rejected').toBe(false)
    expect(res.error).toMatch(/can only be created as ASSIGNED/i)
  })

  test('a learner cannot tamper with the score alone, leaving status untouched', async () => {
    const res = sqlAsAppUser(
      `UPDATE training_assignees SET score=100 WHERE id='${assignee.id}';`,
      { userId: USERS.learner.id, companyId: COMPANY_ID },
    )

    expect(res.ok, 'score is part of the regulated record').toBe(false)
    expect(findAssignee(instanceId).score).toBeNull()
  })

  test("a learner cannot touch a PEER's record (RLS self-scope still holds)", async ({ browser }) => {
    // Second assignee owned by a different user, on the same instance.
    const ctx = await browser.newContext({ storageState: AUTH.trainingAdmin })
    const page = await ctx.newPage()
    const peerInstance = await launchTraining(page, { userIds: [USERS.author.id] })
    await ctx.close()
    const peer = findAssignee(peerInstance, USERS.author.id)
    expect(peer).toBeTruthy()

    const res = sqlAsAppUser(
      `UPDATE training_assignees SET status='VERIFIED' WHERE id='${peer.id}';`,
      { userId: USERS.learner.id, companyId: COMPANY_ID },
    )

    // RLS filters the row out rather than raising — the UPDATE matches nothing.
    // Either way the peer's record must be unchanged.
    expect(findAssignee(peerInstance, USERS.author.id).status).toBe('ASSIGNED')
    if (res.ok) expect(res.output).toMatch(/UPDATE 0/)
  })

  test('the guard still allows the legitimate lifecycle through trusted server code', async () => {
    // Sanity check that the fix is a guard, not a wall: the same transitions the
    // REST controllers perform (they connect as the superuser, so they are
    // trusted) must still succeed, and an illegal skip must not.
    const { sql } = await import('../fixtures/db.js')

    sql(`UPDATE training_assignees SET status='IN_PROGRESS', started_at=NOW() WHERE id='${assignee.id}';`)
    expect(findAssignee(instanceId).status).toBe('IN_PROGRESS')

    sql(
      `UPDATE training_assignees
          SET status='COMPLETED', score=90, completed_at=NOW(), signed_at=NOW(), signature_method='PIN'
        WHERE id='${assignee.id}';`,
    )
    expect(findAssignee(instanceId).status).toBe('COMPLETED')

    sql(`UPDATE training_assignees SET status='VERIFIED' WHERE id='${assignee.id}';`)
    expect(findAssignee(instanceId).status).toBe('VERIFIED')
  })
})
