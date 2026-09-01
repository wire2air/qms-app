// PW-J18 · The reviewer picker offers only who the validator will accept.
//
// A submit dialog derived eligibility itself from IndexedDB: read the step's
// roles, expand to users, and treat "no roles found" as "unrestricted". An
// unsynced cache was therefore indistinguishable from a step with no roles, so
// the dialog offered every internal user and the server refused the pick after
// the submitter had already chosen someone and pressed submit.
//
// Eligibility now has one implementation — the same function that validates —
// and the client asks for it. These guard that contract.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'

const COMPANY = 'e2e00001-0000-4000-8000-000000000001'

test.describe('PW-J18 · reviewer pool', () => {
  test('the endpoint answers with roles and eligible users, not a guess', async ({ browser }) => {
    const versionId = sqlValue(`
      SELECT wv.id FROM workflow_versions wv
      JOIN workflow_steps s ON s.workflow_version_id = wv.id
      JOIN workflow_step_roles sr ON sr.step_id = s.id
      WHERE wv.company_id = '${COMPANY}' LIMIT 1`)
    test.skip(!versionId, 'no role-bound workflow in the E2E seed')

    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    await page.goto('/')
    const res = await page.request.get(
      `/api/v1/services/workflowVersions/${versionId}/reviewerPool`,
    )
    expect(res.status()).toBe(200)
    const body = await res.json()
    const pool = body?.pool ?? body?.data?.pool
    expect(Array.isArray(pool), 'pool is returned').toBeTruthy()

    const gated = pool.find((p) => !p.unrestricted)
    expect(gated, 'the role-bound step is reported as restricted').toBeTruthy()
    // The two facts the picker needs, stated rather than inferred.
    expect(gated).toHaveProperty('unrestricted', false)
    expect(Array.isArray(gated.userIds)).toBeTruthy()
    expect(gated.roles.length, 'the roles it filters on are named').toBeGreaterThan(0)

    // And it agrees with the database the validator reads.
    const expected = sqlValue(`
      SELECT count(DISTINCT ru.user_id) FROM workflow_step_roles sr
      JOIN roles_on_users ru ON ru.role_id = sr.role_id
      WHERE sr.step_id = '${gated.stepId}'`)
    expect(String(gated.userIds.length)).toBe(String(expected))
    await ctx.close()
  })

  test('a cold cache does not read as "no restriction"', async ({ browser }) => {
    const versionId = sqlValue(`
      SELECT wv.id FROM workflow_versions wv
      JOIN workflow_steps s ON s.workflow_version_id = wv.id
      JOIN workflow_step_roles sr ON sr.step_id = s.id
      WHERE wv.company_id = '${COMPANY}' LIMIT 1`)
    test.skip(!versionId, 'no role-bound workflow in the E2E seed')

    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    await page.goto('/')
    // Wipe IndexedDB — the exact condition that produced the original bug.
    await page.evaluate(async () => {
      const dbs = (await indexedDB.databases?.()) ?? []
      await Promise.all(dbs.map((d) => d.name && indexedDB.deleteDatabase(d.name)))
    })
    const res = await page.request.get(
      `/api/v1/services/workflowVersions/${versionId}/reviewerPool`,
    )
    expect(res.status(), 'the server still answers with a cold client').toBe(200)
    const body = await res.json()
    const pool = body?.pool ?? body?.data?.pool
    // The whole point: the restriction survives an empty cache.
    expect(pool.some((p) => !p.unrestricted)).toBeTruthy()
    await ctx.close()
  })

  test('the pool is scoped to the caller’s company', async ({ browser }) => {
    const foreign = sqlValue(
      `SELECT id FROM workflow_versions WHERE company_id <> '${COMPANY}' LIMIT 1`,
    )
    test.skip(!foreign, 'no other-company workflow to test against')
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const page = await ctx.newPage()
    await page.goto('/')
    const res = await page.request.get(
      `/api/v1/services/workflowVersions/${foreign}/reviewerPool`,
      { failOnStatusCode: false },
    )
    expect([403, 404], 'another company’s workflow is not readable').toContain(res.status())
    await ctx.close()
  })
})
