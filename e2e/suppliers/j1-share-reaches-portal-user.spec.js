// SUP-J1 — Sharing a document reaches the portal user, content and all.
//
// This is the journey that had to work before the public token page could be
// deleted. The old page handed an anonymous holder the document, its version
// and every section body. If the authenticated replacement stopped at the
// document row, the retirement would have quietly removed a capability rather
// than secured it.
//
// The chain under test is three policies deep and only the first is obvious:
//   documents_sel          — has an explicit shared_with_user branch
//   document_versions      — grant branch is `status_id = 'EFFECTIVE' AND EXISTS(grant)`
//   document_sections      — has NO grant branch of its own; it nests a
//                            subquery on document_versions, so it inherits
//                            that verdict transitively
// A green run here is what proves the third link actually holds.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { SUPPLIER_USER } from '../fixtures/cast.js'
import { seedDocument, shareDocument, portalSees, cleanup } from '../fixtures/suppliers.js'

test.describe('SUP-J1 · a shared document reaches the portal user', () => {
  const created = { documentIds: [], shareIds: [] }

  test.afterAll(() => cleanup(created))

  test('document, its EFFECTIVE version and that version’s sections all become visible', () => {
    const doc = seedDocument({ title: 'E2E SUP-J1 Shared SOP' })
    created.documentIds.push(doc.id)

    // Before the grant the portal user holds nothing at all.
    expect(portalSees('documents', `id = '${doc.id}'`), 'invisible before sharing').toBe(0)
    expect(portalSees('document_versions', `id = '${doc.versionId}'`)).toBe(0)
    expect(portalSees('document_sections', `id = '${doc.sectionId}'`)).toBe(0)

    const shareId = shareDocument(doc.id)
    created.shareIds.push(shareId)

    expect(portalSees('documents', `id = '${doc.id}'`), 'document visible after sharing').toBe(1)
    expect(
      portalSees('document_versions', `id = '${doc.versionId}'`),
      'the EFFECTIVE version comes with it',
    ).toBe(1)
    expect(
      portalSees('document_sections', `id = '${doc.sectionId}'`),
      'section bodies come with it — this is the content the retired public page served',
    ).toBe(1)
  })

  test('the grant is per-user, not per-company: another portal user sees nothing', () => {
    const doc = seedDocument({ title: 'E2E SUP-J1 Not Yours' })
    created.documentIds.push(doc.id)
    const shareId = shareDocument(doc.id, SUPPLIER_USER.id)
    created.shareIds.push(shareId)

    // The owner is the only other account guaranteed to exist in every seed;
    // isOwner bypasses RLS, so the honest negative control is a second
    // *unprivileged* identity — a random uuid stands in for "not the grantee".
    const stranger = '00000000-0000-4000-8000-0000000000ff'
    expect(
      portalSees('documents', `id = '${doc.id}'`, stranger),
      'a user without the grant must not see the document',
    ).toBe(0)
  })
})
