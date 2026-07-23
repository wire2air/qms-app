// PW-J5 — New version + supersede (TC-10). Exercises the DC-NV-01 fix: creating
// a new revision from an EFFECTIVE version auto-demotes the prior is_latest
// (no more one_latest_uniq collision). Driving the new version to EFFECTIVE
// supersedes the old one, preserving the "exactly one EFFECTIVE" invariant.
import { test, expect } from '@playwright/test'
import { AUTH } from '../fixtures/cast.js'
import {
  createSopDocument,
  fillAllSections,
  submitForReview,
  driveToEffective,
  createNewRevision,
  uniqueTitle,
} from '../fixtures/documents.js'
import { findDocumentByTitle, versionsOf, waitForSqlValue } from '../fixtures/db.js'

test.describe('PW-J5 · new version + supersede', () => {
  test('effective → new revision (auto-demote) → approve → supersede, one EFFECTIVE', async ({ browser }) => {
    test.setTimeout(420_000) // two full approval cycles + a revision
    const ctx = await browser.newContext({ storageState: AUTH.author })
    const page = await ctx.newPage()
    const title = uniqueTitle('J5-supersede')

    // v1.0 → EFFECTIVE.
    await createSopDocument(page, title)
    const doc = findDocumentByTitle(title)
    await fillAllSections(page, doc.id)
    await submitForReview(page)
    const [v1] = versionsOf(doc.id)
    await driveToEffective(browser, doc.id, v1.id)

    // Create a new revision (major bump → 2.0). DC-NV-01: this used to fail on
    // document_versions_one_latest_uniq; the auto-demote trigger makes it succeed.
    await createNewRevision(page, doc.id, { changeType: 'Minor' })
    await waitForSqlValue(
      `SELECT count(*) FROM document_versions WHERE document_id = '${doc.id}' AND deleted_at IS NULL AND version_major = 2`,
      { timeoutMs: 20_000, label: 'v2.0 draft created' },
    )
    let versions = versionsOf(doc.id)
    expect(versions).toHaveLength(2)
    // version_label is derived on the client (`${major}.${minor}`), not stored,
    // so identify the versions by id: there are exactly two, one is v1.
    const v1After = versions.find((v) => v.id === v1.id)
    const v2 = versions.find((v) => v.id !== v1.id)
    expect(v2.statusId).toBe('DRAFT')
    expect(v2.isLatest, 'new revision is latest').toBe(true)
    expect(v1After.statusId).toBe('EFFECTIVE')
    expect(v1After.isLatest, 'prior version demoted from latest').toBe(false)
    // Exactly one is_latest across the document.
    expect(versions.filter((v) => v.isLatest)).toHaveLength(1)

    // Drive v2.0 to EFFECTIVE — the prior EFFECTIVE must supersede.
    await fillAllSections(page, doc.id)
    await submitForReview(page)
    await driveToEffective(browser, doc.id, v2.id)

    // v2.0 EFFECTIVE, v1.0 SUPERSEDED, exactly one EFFECTIVE.
    await waitForSqlValue(
      `SELECT status_id FROM document_versions WHERE id = '${v1.id}' AND status_id = 'SUPERSEDED'`,
      { timeoutMs: 40_000, label: 'v1.0 superseded' },
    )
    versions = versionsOf(doc.id)
    expect(versions.find((v) => v.id === v2.id).statusId).toBe('EFFECTIVE')
    expect(versions.filter((v) => v.statusId === 'EFFECTIVE')).toHaveLength(1)
    await ctx.close()
  })
})
