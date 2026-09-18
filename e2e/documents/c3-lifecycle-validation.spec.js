// C3 — Zod validation on the version lifecycle verbs (API-03..06). The routes now
// mount validate({ body: schema }) after the permission gate, so a malformed body
// is rejected with 400 before the controller runs. Proven against the live api
// with a real (author) session; a bogus versionId is fine because validation
// fires ahead of the controller's lookup.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'

const API = 'http://e2elab.localhost:4000'
const BOGUS = '00000000-0000-4000-8000-000000000000'
const submitForReview = `${API}/v1/services/documents/${BOGUS}/versions/${BOGUS}/submitForReview`

test.describe('C3 · Zod validation on version lifecycle verbs', () => {
  test('a malformed body is rejected 400 (validation runs before the controller)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.author })
    // reviewers must be { [stepId]: [uuid, ...] } — a non-uuid reviewer id is invalid.
    const res = await ctx.request.post(submitForReview, {
      data: { reviewers: { 'step-1': ['not-a-uuid'] } },
    })
    expect(res.status()).toBe(400)
    await ctx.close()
  })

  test('a well-formed body passes validation (reaches the controller → 404 for a bogus version)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const res = await ctx.request.post(submitForReview, { data: {} })
    // Validation passed (not 400); the controller then 404s the non-existent version.
    expect(res.status(), 'validation should not reject a well-formed body').not.toBe(400)
    await ctx.close()
  })
})
