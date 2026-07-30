// SUP-J6 — 🟡 A shared document does NOT carry its references. PINS CURRENT
// BEHAVIOUR — this spec asserts a gap, not a guarantee.
//
// Controlled documents cite each other: an SOP says "calibrate per QP-014".
// Sharing the SOP grants exactly one row in shared_with_user, and the RLS
// branch matches on `entity_id = documents.id` — so the citation resolves to
// nothing for the supplier. Worse, `document_links` itself is invisible too,
// so the portal cannot even render "this document references another you
// cannot see": the supplier gets a dead mention and the sharer gets no signal
// they under-shared.
//
// WHY THIS IS PINNED RATHER THAN FIXED. Expansion is a real design decision,
// not an oversight:
//   • document_links is VERSION→VERSION, so any expansion must resolve
//     shared document → EFFECTIVE version → link → target version → its parent
//     document, and re-resolve whenever a new revision goes effective.
//   • Depth is policy. One level covers "SOP cites a form"; transitive closure
//     can hand a large slice of the QMS to an external party from one share.
//
// WHEN EXPANSION SHIPS, INVERT THIS FILE — the referenced document should
// become visible and the assertions below should read `.toBe(1)`.
// See docs/modules/suppliers/21-portal-retirement-2026-07-30.md §4.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { seedDocument, linkDocuments, shareDocument, portalSees, cleanup } from '../fixtures/suppliers.js'

test.describe('SUP-J6 · referenced documents do not follow a share', () => {
  const created = { documentIds: [], shareIds: [] }

  test.afterAll(() => cleanup(created))

  test('the referenced document stays invisible when only the citing document is shared', () => {
    const sop = seedDocument({ title: 'E2E SUP-J6 Citing SOP' })
    const referenced = seedDocument({ title: 'E2E SUP-J6 Referenced Procedure' })
    created.documentIds.push(sop.id, referenced.id)

    linkDocuments(sop.versionId, referenced.versionId)
    created.shareIds.push(shareDocument(sop.id))

    expect(portalSees('documents', `id = '${sop.id}'`), 'the shared SOP is visible').toBe(1)
    expect(
      portalSees('documents', `id = '${referenced.id}'`),
      'GAP: the document it cites is not — the supplier reads a dead reference',
    ).toBe(0)
    expect(
      portalSees('document_versions', `id = '${referenced.versionId}'`),
      'GAP: nor its content',
    ).toBe(0)
  })

  test('the link row itself is invisible, so the portal cannot even show a reference exists', () => {
    const sop = seedDocument({ title: 'E2E SUP-J6 Citing SOP 2' })
    const referenced = seedDocument({ title: 'E2E SUP-J6 Referenced 2' })
    created.documentIds.push(sop.id, referenced.id)

    linkDocuments(sop.versionId, referenced.versionId)
    created.shareIds.push(shareDocument(sop.id))

    expect(
      portalSees('document_links', `from_document_version_id = '${sop.versionId}'`),
      'GAP: no way to render "references a document you cannot access"',
    ).toBe(0)
  })

  test('explicitly sharing the referenced document is the current workaround', () => {
    // Not a nicety — it is the documented answer until expansion ships, and it
    // proves the gap is about propagation, not about some deeper limit.
    const sop = seedDocument({ title: 'E2E SUP-J6 Citing SOP 3' })
    const referenced = seedDocument({ title: 'E2E SUP-J6 Referenced 3' })
    created.documentIds.push(sop.id, referenced.id)

    linkDocuments(sop.versionId, referenced.versionId)
    created.shareIds.push(shareDocument(sop.id))
    created.shareIds.push(shareDocument(referenced.id))

    expect(portalSees('documents', `id = '${referenced.id}'`), 'visible once shared in its own right').toBe(1)
    expect(portalSees('document_sections', `id = '${referenced.sectionId}'`), 'with its content').toBe(1)
  })
})
