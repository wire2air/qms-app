// SUP-J11 — The sharing REST surface, which the pack said did not exist.
//
// `00-inventory.md` recorded, for three cycles, that "sharing has no REST
// surface: `shared_with_user` is written over GraphQL from the Share panel, so
// RLS is its only gate." That was never true. `backend/api/routes/sharing.js`
// has carried four routes since 2026-06-01:
//
//     GET    /v1/services/sharing
//     POST   /v1/services/sharing
//     DELETE /v1/services/sharing/:id
//     DELETE /v1/services/sharing            (by entity + user)
//
// and it matters more than a documentation slip, because `REST_RLS_ENABLED` is
// `false` by default: on this path RLS does not run at all. Whatever the
// controller checks IS the check. Nothing in the repository has ever tested it.
//
// What the controller checked was uneven, and the two halves of this spec were
// that unevenness. CREATE calls `assertCanShareEntity` — entity must exist in the
// caller's company AND the caller must hold the matching per-type `:update`
// grant. READ and both REVOKE routes filtered on `companyId` and nothing else.
//
// FIXED 2026-09-07 (PERM-R6). All four routes now run `assertCanShareEntity`:
// `listShares` requires entityType + entityId (there is no longer a query that
// means "every share in the tenant") and authorizes that entity; `revokeShare`
// re-reads the share's OWN entity rather than trusting anything the caller
// supplied; `revokeShareByEntityUser` authorizes the body's entity. The four
// tests that recorded the gap have been INVERTED, as their own comments
// instructed — they are the regression guard now, not the bug report.
//
// The entity→permission map is also the interesting counterpart to the RLS flat
// OR. The `shared_with_user` INSERT policy ORs four grants together and never
// consults `entity_type`, so at the database layer `capa:update` shares a
// Document. The REST controller does NOT do that (test 2). The two layers
// disagree, and only one of them is on the path the SPA uses.
//
// SINGLE SESSION PER DESCRIBE — two personas, two `test.use` blocks, never both
// live at once (SUP-J8's header explains why).
import { test, expect } from '../../video/fixtures/videoTest.js'
import { ALT_COMPANY_ID, AUTH, SUPPLIER_USER } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import {
  cleanup,
  deleteCapa,
  portalContext,
  seedCapa,
  seedDocument,
  shareDocument,
} from '../fixtures/suppliers.js'

const SHARING = '/api/v1/services/sharing'

/** Is there a LIVE grant of `documentId` to the portal user? */
function liveShare(documentId) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM shared_with_user
        WHERE entity_type = 'Document' AND entity_id = '${documentId}'
          AND user_id = '${SUPPLIER_USER.id}' AND deleted_at IS NULL`,
    ),
  )
}

// ── Half 1 · a legitimate sharer, and the two things that stop them ──────────

test.describe('SUP-J11a · POST /v1/services/sharing enforces entity + permission', () => {
  test.use({ storageState: AUTH.controller }) // document_control:update, NO capa:update

  const created = { documentIds: [], shareIds: [] }
  const capaIds = []

  test.afterAll(() => {
    for (const id of capaIds) deleteCapa(id)
    cleanup(created)
  })

  test('CONTROL · a document controller shares a document, and the row lands', async ({
    request,
  }) => {
    const doc = seedDocument({ title: 'E2E SUP-J11 Controller Share' })
    created.documentIds.push(doc.id)

    const res = await request.post(SHARING, {
      data: { entityType: 'Document', entityId: doc.id, userId: SUPPLIER_USER.id },
      failOnStatusCode: false,
    })
    expect(res.status(), `share should be accepted, got ${res.status()}`).toBeLessThan(300)
    expect(liveShare(doc.id), 'a real grant row exists afterwards').toBe(1)
  })

  test('CONTROL · the same caller cannot share a CAPA — REST maps type → permission', async ({
    request,
  }) => {
    // The RLS INSERT policy would allow this from the other direction: it ORs
    // document_control/capa/ncr/quality_events `:update` and never looks at
    // entity_type. The REST controller asks specifically for `capa:update`,
    // which this persona does not hold. If this ever starts returning 2xx, the
    // controller has drifted onto the policy's flat-OR shape.
    const capa = seedCapa()
    capaIds.push(capa.id)

    const res = await request.post(SHARING, {
      data: { entityType: 'Capa', entityId: capa.id, userId: SUPPLIER_USER.id },
      failOnStatusCode: false,
    })
    expect(res.status(), 'document_control:update must not confer capa sharing').toBe(403)
    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM shared_with_user WHERE entity_type = 'Capa' AND entity_id = '${capa.id}' AND deleted_at IS NULL`,
        ),
      ),
      'and nothing was written',
    ).toBe(0)
  })

  test("CONTROL · another tenant's document is not shareable", async ({ request }) => {
    // `req.companyId` is already pinned by requireCompanyAccess, so this is
    // belt-and-braces — but it is the belt that stops cross-tenant UUID fishing
    // from producing a grant row that RLS would then honour.
    const foreign = seedDocument({
      title: 'E2E SUP-J11 Foreign Document',
      companyId: ALT_COMPANY_ID,
    })
    try {
      const res = await request.post(SHARING, {
        data: { entityType: 'Document', entityId: foreign.id, userId: SUPPLIER_USER.id },
        failOnStatusCode: false,
      })
      expect(res.status(), 'a document outside the caller company is not found').toBe(404)
      expect(liveShare(foreign.id), 'and nothing was written').toBe(0)
    } finally {
      sql(`DELETE FROM shared_with_user WHERE entity_id = '${foreign.id}'`)
      sql(`DELETE FROM document_sections WHERE document_id = '${foreign.id}'`)
      sql(`DELETE FROM document_versions WHERE document_id = '${foreign.id}'`)
      sql(`DELETE FROM documents WHERE id = '${foreign.id}'`)
    }
  })
})

// ── Half 2 · a user holding nothing at all ──────────────────────────────────

test.describe('SUP-J11b · read and revoke carry no permission check', () => {
  test.use({ storageState: AUTH.noAccess }) // zero grants of any kind

  const created = { documentIds: [], shareIds: [] }
  test.afterAll(() => cleanup(created))

  test('CONTROL · a zero-grant member cannot CREATE a share', async ({ request }) => {
    const doc = seedDocument({ title: 'E2E SUP-J11 NoAccess Create' })
    created.documentIds.push(doc.id)

    const res = await request.post(SHARING, {
      data: { entityType: 'Document', entityId: doc.id, userId: SUPPLIER_USER.id },
      failOnStatusCode: false,
    })
    expect(res.status(), 'createShare runs assertCanShareEntity').toBe(403)
    expect(liveShare(doc.id), 'and nothing was written').toBe(0)
  })

  test('CONTROL · nor can the same member revoke someone else’s share by id', async ({
    request,
  }) => {
    const doc = seedDocument({ title: 'E2E SUP-J11 Revoke By Id' })
    created.documentIds.push(doc.id)
    const shareId = shareDocument(doc.id)
    created.shareIds.push(shareId)
    expect(liveShare(doc.id), 'baseline: the supplier holds the grant').toBe(1)

    const res = await request.delete(`${SHARING}/${shareId}`, { failOnStatusCode: false })

    // INVERTED 2026-09-07 (PERM-R6), as this test's previous comment instructed.
    // `revokeShare` now re-reads the share's OWN entityType/entityId and runs the
    // same assertCanShareEntity that createShare has always run, so withdrawing a
    // grant needs the authority that conferring one needs.
    expect(res.status(), 'revoke by id is refused for a zero-grant caller').toBe(403)
    expect(liveShare(doc.id), 'and the supplier keeps the access nobody revoked').toBe(1)
  })

  test('CONTROL · …nor by (entity, user), which is the path the UI uses', async ({ request }) => {
    const doc = seedDocument({ title: 'E2E SUP-J11 Revoke By Entity' })
    created.documentIds.push(doc.id)
    created.shareIds.push(shareDocument(doc.id))
    expect(liveShare(doc.id), 'baseline: the supplier holds the grant').toBe(1)

    const res = await request.delete(SHARING, {
      data: { entityType: 'Document', entityId: doc.id, userId: SUPPLIER_USER.id },
      failOnStatusCode: false,
    })
    expect(res.status(), 'the convenience route is gated identically').toBe(403)
    expect(liveShare(doc.id), 'same outcome: the grant stands').toBe(1)
  })

  test('CONTROL · …and cannot enumerate the tenant’s grants (F-05 over REST)', async ({
    request,
  }) => {
    const doc = seedDocument({ title: 'E2E SUP-J11 Enumeration Probe' })
    created.documentIds.push(doc.id)
    created.shareIds.push(shareDocument(doc.id))

    // INVERTED 2026-09-07 (PERM-R6). Two halves, because the fix has two parts.
    //
    // (1) The unscoped call — which used to return `where { companyId }`, i.e.
    //     every share in the tenant joined to the recipient's and grantor's
    //     names and emails — is now refused outright: entityType and entityId
    //     are required, so there is no query that means "all of them".
    const bare = await request.get(SHARING, { failOnStatusCode: false })
    expect(bare.status(), 'listShares refuses an unscoped enumeration').toBe(400)

    // (2) Scoped to a specific entity, it is authorized like every other read of
    //     that entity's sharing — the same check createShare runs.
    const scoped = await request.get(
      `${SHARING}?entityType=Document&entityId=${doc.id}`,
      { failOnStatusCode: false },
    )
    expect(scoped.status(), 'and a zero-grant caller cannot read even one entity').toBe(403)
  })
})

// ── Half 3 · the external party ─────────────────────────────────────────────
//
// The two halves above are internal members. The question that sets the severity
// is whether the SAME routes answer an EXTERNAL_SUPPLIER, because a supplier's
// session is `FULL`-scoped (only the floor portal's `PORTAL_ONLY` sessions are
// bounced off main-app endpoints) and `requireCompanyAccess` treats them as an
// ordinary company member.

test.describe('SUP-J11c · the same routes, called by the external party', () => {
  const created = { documentIds: [], shareIds: [] }
  test.afterAll(() => cleanup(created))

  test('CONTROL · a supplier can neither enumerate the tenant’s grants nor revoke one', async () => {
    const doc = seedDocument({ title: 'E2E SUP-J11 External Caller Probe' })
    created.documentIds.push(doc.id)
    const shareId = shareDocument(doc.id)
    created.shareIds.push(shareId)

    const ctx = await portalContext()
    try {
      // INVERTED 2026-09-07 (PERM-R6). The external party is the reason this
      // mattered most: an EXTERNAL_SUPPLIER session is FULL-scoped, so it reaches
      // these routes as an ordinary member. It now meets the same two refusals.
      const list = await ctx.get(SHARING, { failOnStatusCode: false })
      expect(list.status(), 'the external party cannot enumerate at all').toBe(400)

      const scoped = await ctx.get(`${SHARING}?entityType=Document&entityId=${doc.id}`, {
        failOnStatusCode: false,
      })
      expect(scoped.status(), 'nor read one entity’s grants').toBe(403)

      const revoke = await ctx.delete(`${SHARING}/${shareId}`, { failOnStatusCode: false })
      expect(revoke.status(), 'nor withdraw a grant it has no authority over').toBe(403)
      expect(liveShare(doc.id), 'the grant stands').toBe(1)
    } finally {
      await ctx.dispose()
    }
  })
})
