// C1 — REST document read now requires document_control:read (partial H2 fix).
//   Before: GET /documents[/:id] mounted requireCompanyAccess with NO permission
//   key, so any authenticated company user could read documents over REST.
//   After: the routes add enforcePermission('document_control','read') → callers
//   without the read grant get 403.
//
// SCOPE NOTE (deferred): these endpoints still run as the DB superuser (RLS
// bypassed) and filter by companyId only, so read *scope tiers* / draft-privacy
// are NOT enforced on REST — a user who HAS the read grant can still see
// company-wide rows here. That remaining scope half of H2 is intentionally left
// for a follow-up; the app itself reads via GraphQL, where the RLS read gate IS
// enforced. This test guards only the permission gate that C1 adds.
//
// Verified through the live local stack (api :4000 ← the role's storageState
// cookies) — no backend test DB involved.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH } from '../fixtures/cast.js'
import { createSopDocument, uniqueTitle } from '../fixtures/documents.js'
import { findDocumentByTitle } from '../fixtures/db.js'

const API = 'http://e2elab.localhost:4000'
const LIST = `${API}/v1/services/documents`

test.describe('C1 · REST document read requires document_control:read', () => {
  let docId

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    const title = uniqueTitle('C1-doc')
    await createSopDocument(page, title)
    docId = findDocumentByTitle(title).id
    await ctx.close()
  })

  test('a user without document_control:read is rejected 403', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH.noAccess })
    expect((await ctx.request.get(LIST)).status()).toBe(403)
    expect((await ctx.request.get(`${API}/v1/services/documents/${docId}`)).status()).toBe(403)
    await ctx.close()
  })

  test('a user WITH the read grant is admitted (list + detail)', async ({ browser }) => {
    // Ava (auditor) holds document_control:read → passes the gate.
    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    expect((await ctx.request.get(LIST)).status()).toBe(200)
    const author = await browser.newContext({ storageState: AUTH.author })
    const res = await author.request.get(`${API}/v1/services/documents/${docId}`)
    expect(res.status()).toBe(200)
    expect((await res.json()).document?.id).toBe(docId)
    await author.close()
    await ctx.close()
  })

  test('a cross-tenant user cannot read the document', async ({ browser }) => {
    // altOwner is E2EALT; its session cookie is scoped to e2ealt.localhost and is
    // not sent to the e2elab API host → 401. (If it were, company scope would deny
    // with 403/404.) Any of these means "cannot read".
    const ctx = await browser.newContext({ storageState: AUTH.altOwner })
    const res = await ctx.request.get(`${API}/v1/services/documents/${docId}`)
    expect([401, 403, 404]).toContain(res.status())
    await ctx.close()
  })
})
