// SUP-J6 — A shared document carries the documents it cites.
//
// INVERTED 2026-07-30. This file used to pin a gap: sharing an SOP that said
// "calibrate per QP-014" left QP-014 unreachable, and the `document_links` row
// was invisible too, so the portal could not even show that a reference
// existed. The supplier read a dead mention.
//
// Reference expansion closed it with explicit cascade grants — real
// `shared_with_user` rows carrying `granted_via = 'REFERENCE'` and a
// `source_entity_id` — rather than a wider RLS branch, so every document a
// supplier can read is still a row someone can point at.
//
// The expansion runs as a worker side-effect off the audit trigger, so these
// assertions wait for it rather than reading immediately.
//
// WHAT THIS FILE IS REALLY GUARDING is the two edges that are easy to get
// wrong and expensive to get wrong quietly:
//   • revoking a parent must not revoke a document another shared parent still
//     cites (that is the whole reason source_entity_id exists)
//   • a cascade grant must never downgrade or displace a direct one — the
//     table admits ONE live grant per (user, entity), so a careless upsert
//     would silently rewrite an admin's deliberate share
import { test, expect } from '../../video/fixtures/videoTest.js'
import { SUPPLIER_USER } from '../fixtures/cast.js'
import { waitForSqlValue, sqlRow } from '../fixtures/db.js'
import {
  seedDocument,
  linkDocuments,
  shareDocument,
  revokeShare,
  portalSees,
  cleanup,
} from '../fixtures/suppliers.js'

// sqlRow, not sqlValue: psql -tA separates columns with '|' and sqlValue keeps
// only the first, so a composite expression would silently lose its tail.
function grantRow(documentId) {
  const row = sqlRow(`
    SELECT granted_via, COALESCE(source_entity_id::text, '-')
      FROM shared_with_user
     WHERE user_id = '${SUPPLIER_USER.id}' AND entity_type = 'Document'
       AND entity_id = '${documentId}' AND deleted_at IS NULL
  `)
  if (!row) return null
  return { grantedVia: row[0], sourceEntityId: row[1] }
}

async function waitForGrant(documentId, label) {
  await waitForSqlValue(
    `SELECT 1 FROM shared_with_user
      WHERE user_id = '${SUPPLIER_USER.id}' AND entity_type = 'Document'
        AND entity_id = '${documentId}' AND deleted_at IS NULL LIMIT 1`,
    { timeoutMs: 20_000, label },
  )
}

test.describe('SUP-J6 · references follow the share', () => {
  const created = { documentIds: [], shareIds: [] }

  test.afterAll(() => cleanup(created))

  test('sharing a citing document also grants the document it cites', async () => {
    const sop = seedDocument({ title: 'E2E SUP-J6 Citing SOP' })
    const cited = seedDocument({ title: 'E2E SUP-J6 Cited Procedure' })
    created.documentIds.push(sop.id, cited.id)
    linkDocuments(sop.versionId, cited.versionId)

    created.shareIds.push(shareDocument(sop.id))
    await waitForGrant(cited.id, 'cascade grant on the cited document')

    expect(portalSees('documents', `id = '${cited.id}'`), 'the cited document is readable').toBe(1)
    expect(
      portalSees('document_sections', `id = '${cited.sectionId}'`),
      'including its content — a citation the supplier can actually follow',
    ).toBe(1)

    const grant = grantRow(cited.id)
    expect(grant.grantedVia, 'marked as a cascade grant').toBe('REFERENCE')
    expect(grant.sourceEntityId, 'and it names the document that justifies it').toBe(sop.id)
  })

  test('revoking the citing document withdraws the cascade grant', async () => {
    const sop = seedDocument({ title: 'E2E SUP-J6 Revoked SOP' })
    const cited = seedDocument({ title: 'E2E SUP-J6 Revoked Cited' })
    created.documentIds.push(sop.id, cited.id)
    linkDocuments(sop.versionId, cited.versionId)

    const shareId = shareDocument(sop.id)
    created.shareIds.push(shareId)
    await waitForGrant(cited.id, 'cascade grant before revoke')

    revokeShare(shareId)
    await waitForSqlValue(
      `SELECT 1 FROM shared_with_user
        WHERE entity_id = '${cited.id}' AND user_id = '${SUPPLIER_USER.id}'
          AND deleted_at IS NOT NULL LIMIT 1`,
      { timeoutMs: 20_000, label: 'cascade grant withdrawn with its parent' },
    )

    expect(portalSees('documents', `id = '${cited.id}'`), 'no longer readable').toBe(0)
  })

  test('a document two shared parents cite survives revoking only one of them', async () => {
    // The case source_entity_id exists for. Without it, revoking either parent
    // would blind the supplier to a document the other still entitles them to.
    const sopA = seedDocument({ title: 'E2E SUP-J6 Parent A' })
    const sopB = seedDocument({ title: 'E2E SUP-J6 Parent B' })
    const shared = seedDocument({ title: 'E2E SUP-J6 Cited By Both' })
    created.documentIds.push(sopA.id, sopB.id, shared.id)
    linkDocuments(sopA.versionId, shared.versionId)
    linkDocuments(sopB.versionId, shared.versionId)

    const shareA = shareDocument(sopA.id)
    created.shareIds.push(shareA)
    await waitForGrant(shared.id, 'cascade grant from parent A')
    created.shareIds.push(shareDocument(sopB.id))

    revokeShare(shareA)
    // Give the revoke side-effect time to run and decide.
    await waitForSqlValue(
      `SELECT 1 FROM shared_with_user
        WHERE entity_id = '${sopA.id}' AND deleted_at IS NOT NULL LIMIT 1`,
      { timeoutMs: 20_000, label: 'parent A revoked' },
    )

    expect(
      portalSees('documents', `id = '${shared.id}'`),
      'parent B still cites it, so the grant must hold',
    ).toBe(1)
  })

  test('a cascade grant never displaces a direct share', async () => {
    // One live grant per (user, entity) is a DB invariant, so the expansion
    // must skip a document the admin already shared deliberately — otherwise
    // revoking the citing document would silently revoke the direct share too.
    const sop = seedDocument({ title: 'E2E SUP-J6 Citing SOP 2' })
    const cited = seedDocument({ title: 'E2E SUP-J6 Directly Shared' })
    created.documentIds.push(sop.id, cited.id)
    linkDocuments(sop.versionId, cited.versionId)

    created.shareIds.push(shareDocument(cited.id)) // direct, first
    created.shareIds.push(shareDocument(sop.id)) // then the citing document
    await waitForGrant(cited.id, 'the direct grant is still there')

    const grant = grantRow(cited.id)
    expect(grant.grantedVia, 'the deliberate share is preserved, not downgraded').toBe('MANUAL')
    expect(grant.sourceEntityId, 'and it claims no source').toBe('-')
  })
})
