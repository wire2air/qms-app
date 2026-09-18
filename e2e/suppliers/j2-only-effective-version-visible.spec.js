// SUP-J2 — A share exposes the EFFECTIVE revision and nothing else.
//
// This is stricter than what it replaced. The retired token page rendered
// whichever version the link was minted against, so a link created while a
// revision was in review kept serving that revision forever. The grant branch
// on document_versions is
//
//     status_id = 'EFFECTIVE' AND EXISTS (grant on the parent document)
//
// so a draft, an in-review or a superseded revision of a *shared* document is
// invisible — which is what "controlled document" means: the supplier reads
// what is in force, never work in progress.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { sqlValue } from '../fixtures/db.js'
import { COMPANY_ID } from '../fixtures/cast.js'
import { seedDocument, shareDocument, portalSees, cleanup } from '../fixtures/suppliers.js'

test.describe('SUP-J2 · only the EFFECTIVE revision is exposed', () => {
  const created = { documentIds: [], shareIds: [] }

  test.afterAll(() => cleanup(created))

  test('a DRAFT revision of a shared document stays invisible', () => {
    const doc = seedDocument({ title: 'E2E SUP-J2 In Revision' })
    created.documentIds.push(doc.id)
    created.shareIds.push(shareDocument(doc.id))

    // Add a second, DRAFT revision alongside the EFFECTIVE one — the everyday
    // state of a document being revised while its current version is in force.
    // `change_reason` is required from v1.1 onwards (a revision must say why),
    // enforced by document_versions_change_reason_required.
    // sqlValue, not sql: psql -tAc appends the command tag ("INSERT 0 1") after
    // the returned row, so sql() on an INSERT…RETURNING yields a two-line
    // string and the uuid interpolates malformed.
    const draftId = sqlValue(`
      INSERT INTO document_versions
        (company_id, document_id, version_major, version_minor, status_id, change_reason, created_at, updated_at)
      VALUES ('${COMPANY_ID}', '${doc.id}', 2, 0, 'DRAFT', 'E2E SUP-J2 revision under way', now(), now())
      RETURNING id
    `)

    expect(portalSees('document_versions', `id = '${doc.versionId}'`), 'EFFECTIVE v1.0').toBe(1)
    expect(
      portalSees('document_versions', `id = '${draftId}'`),
      'the DRAFT revision must NOT leak to the supplier',
    ).toBe(0)
  })

  test('a document whose only revision is not EFFECTIVE shares as an empty shell', () => {
    // Sharing a document that has never gone effective is a mis-share, not a
    // leak: the row is visible, the content is not. Pinned so the behaviour is
    // a decision rather than a surprise — the Share dialog only offers
    // documents with an EFFECTIVE version, so this is the back-door case.
    const doc = seedDocument({ title: 'E2E SUP-J2 Never Effective', statusId: 'DRAFT' })
    created.documentIds.push(doc.id)
    created.shareIds.push(shareDocument(doc.id))

    expect(portalSees('documents', `id = '${doc.id}'`), 'the document row is visible').toBe(1)
    expect(portalSees('document_versions', `id = '${doc.versionId}'`), 'no readable revision').toBe(0)
    expect(portalSees('document_sections', `id = '${doc.sectionId}'`), 'no readable content').toBe(0)
  })
})
