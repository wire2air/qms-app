// SUP-J3 — Unsharing actually revokes, and leaves the withdrawal on record.
//
// Revocation is the half of sharing that the retired design could not do
// honestly: a token link was "revoked" by soft-deleting the row, but anyone
// who had already opened the page kept the content, and nothing recorded who
// still held the URL. With per-user grants, revocation is a state change on a
// named grant — and because `deletedAt` is in the audit config's trackFields,
// the withdrawal is logged rather than vanishing.
import { test, expect } from '../../video/fixtures/videoTest.js'
import {
  seedDocument,
  shareDocument,
  revokeShare,
  portalSees,
  existsInDb,
  cleanup,
} from '../fixtures/suppliers.js'

test.describe('SUP-J3 · unshare revokes access', () => {
  const created = { documentIds: [], shareIds: [] }

  test.afterAll(() => cleanup(created))

  test('revoking hides the document, its version and its content again', () => {
    const doc = seedDocument({ title: 'E2E SUP-J3 Revoked SOP' })
    created.documentIds.push(doc.id)
    const shareId = shareDocument(doc.id)
    created.shareIds.push(shareId)

    expect(portalSees('documents', `id = '${doc.id}'`), 'visible while shared').toBe(1)

    revokeShare(shareId)

    expect(portalSees('documents', `id = '${doc.id}'`), 'document hidden after revoke').toBe(0)
    expect(portalSees('document_versions', `id = '${doc.versionId}'`), 'version hidden').toBe(0)
    expect(portalSees('document_sections', `id = '${doc.sectionId}'`), 'content hidden').toBe(0)
  })

  test('the grant row survives the revoke — a soft delete, so the trail keeps it', () => {
    const doc = seedDocument({ title: 'E2E SUP-J3 Audit Trail' })
    created.documentIds.push(doc.id)
    const shareId = shareDocument(doc.id)
    created.shareIds.push(shareId)
    revokeShare(shareId)

    expect(
      existsInDb('shared_with_user', `id = '${shareId}' AND deleted_at IS NOT NULL`),
      'the withdrawn grant is retained with a deleted_at, not erased',
    ).toBe(1)
  })
})
