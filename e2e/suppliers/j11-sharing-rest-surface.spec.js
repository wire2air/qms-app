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
// What the controller checks is uneven, and the two halves of this spec are that
// unevenness. CREATE calls `assertCanShareEntity` — entity must exist in the
// caller's company AND the caller must hold the matching per-type `:update`
// grant. READ and both REVOKE routes filter on `companyId` and nothing else.
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

  test('KNOWN GAP · …but the same member CAN revoke someone else’s share by id', async ({
    request,
  }) => {
    const doc = seedDocument({ title: 'E2E SUP-J11 Revoke By Id' })
    created.documentIds.push(doc.id)
    const shareId = shareDocument(doc.id)
    created.shareIds.push(shareId)
    expect(liveShare(doc.id), 'baseline: the supplier holds the grant').toBe(1)

    const res = await request.delete(`${SHARING}/${shareId}`, { failOnStatusCode: false })

    // `revokeShare` looks the row up by { id, companyId } and destroys it. There
    // is no assertCanShareEntity, no loadUserPermissions, no owner check — and
    // with REST_RLS_ENABLED=false the DELETE/UPDATE policies never run. Granting
    // is an authority; withdrawing one is not. When that is fixed this becomes
    // 403 and the expectations below INVERT — do not delete them.
    expect(res.status(), 'revoke by id is accepted from a zero-grant caller').toBeLessThan(300)
    expect(liveShare(doc.id), 'the supplier has lost access, decided by nobody').toBe(0)
  })

  test('KNOWN GAP · …and by (entity, user), which is the path the UI uses', async ({ request }) => {
    const doc = seedDocument({ title: 'E2E SUP-J11 Revoke By Entity' })
    created.documentIds.push(doc.id)
    created.shareIds.push(shareDocument(doc.id))
    expect(liveShare(doc.id), 'baseline: the supplier holds the grant').toBe(1)

    const res = await request.delete(SHARING, {
      data: { entityType: 'Document', entityId: doc.id, userId: SUPPLIER_USER.id },
      failOnStatusCode: false,
    })
    expect(res.status(), 'the convenience route is gated no differently').toBeLessThan(300)
    expect(liveShare(doc.id), 'same outcome, one fewer round trip').toBe(0)
  })

  test('KNOWN GAP · …and can enumerate every grant in the tenant (F-05 over REST)', async ({
    request,
  }) => {
    const doc = seedDocument({ title: 'E2E SUP-J11 Enumeration Probe' })
    created.documentIds.push(doc.id)
    created.shareIds.push(shareDocument(doc.id))

    const res = await request.get(SHARING, { failOnStatusCode: false })
    expect(res.status(), 'listShares has no permission gate either').toBe(200)

    const body = await res.json()
    const shares = body.shares ?? body.data?.shares ?? []
    const mine = shares.filter((s) => s.entityId === doc.id)
    // The company-wide `shared_with_user` SELECT policy (F-05) has a REST twin
    // that RLS could not close even if the policy were narrowed, because on this
    // path the policy does not run. The list also joins `users`, so it names the
    // recipient — who holds what, for the whole tenant, to a caller holding
    // nothing.
    expect(mine.length, 'a grant this caller has no relationship to is listed').toBe(1)
    expect(mine[0].user?.email, 'and the recipient is named').toBe(SUPPLIER_USER.email)
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

  test('KNOWN GAP · a supplier enumerates the tenant’s grants, and can revoke another’s', async () => {
    const doc = seedDocument({ title: 'E2E SUP-J11 External Caller Probe' })
    created.documentIds.push(doc.id)
    const shareId = shareDocument(doc.id)
    created.shareIds.push(shareId)

    const ctx = await portalContext()
    try {
      const list = await ctx.get(SHARING, { failOnStatusCode: false })
      expect(list.status(), 'the external party reaches the sharing route at all').toBe(200)

      const body = await list.json()
      const shares = body.shares ?? body.data?.shares ?? []
      expect(
        shares.length,
        'and reads the tenant-wide grant list — recipients, grantors, entity ids',
      ).toBeGreaterThan(0)

      const revoke = await ctx.delete(`${SHARING}/${shareId}`, { failOnStatusCode: false })
      expect(revoke.status(), 'and withdraws a grant, holding no permission at all').toBeLessThan(
        300,
      )
      expect(liveShare(doc.id), 'the grant is gone').toBe(0)
    } finally {
      await ctx.dispose()
    }
  })
})
