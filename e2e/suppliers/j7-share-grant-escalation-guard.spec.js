// SUP-J7 — 🔴 F-01 regression guard. GREEN — and it must stay green.
//
// Same polarity as e2e/users/j1: this file does not document a gap, it guards
// one that was closed. A red test here means the hole is open again.
//
// WHAT WAS WRONG. Rows in `shared_with_user` are read-grants — thirteen
// tables' SELECT policies (documents, capas, nonconformances, quality_events,
// complaints, records, form_templates, document_versions, audit_instances,
// audit_document_requests, audit_evidence, audit_findings,
// audit_requirement_responses) carry a branch that trusts them. INSERT and
// DELETE were written with that weight in mind and required one of
// document_control / capa / ncr / quality_events `:update`.
//
// UPDATE checked `company_id` and nothing else — and UPDATE is sufficient,
// because re-pointing a row is indistinguishable from creating one. A
// kind='EXTERNAL_SUPPLIER' portal user holding ZERO grants could take one of
// their own share rows, point it at any record in the tenant, and read it.
// Verified live against app-db before the fix.
//
// The fix gives UPDATE the same clause as its siblings (database/rls.sql,
// shared_with_user_update_rls). Note the assertion style: a USING clause
// EXCLUDES the row rather than raising, so these must assert that nothing
// changed — `expect(...).rejects` would pass for the wrong reason and would
// keep passing if the policy were dropped entirely.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { COMPANY_ID, SUPPLIER_USER } from '../fixtures/cast.js'
import { asAppUser } from '../fixtures/sites.js'
import { sqlValue } from '../fixtures/db.js'
import { seedDocument, shareDocument, portalSees, cleanup } from '../fixtures/suppliers.js'

function shareTarget(shareId) {
  return sqlValue(`SELECT entity_id FROM shared_with_user WHERE id = '${shareId}'`)
}

test.describe('SUP-J7 · a portal user cannot grant themselves reads', () => {
  const created = { documentIds: [], shareIds: [] }

  test.afterAll(() => cleanup(created))

  test('repointing their own grant at an unshared document is refused', () => {
    const shared = seedDocument({ title: 'E2E SUP-J7 Shared With Me' })
    const secret = seedDocument({ title: 'E2E SUP-J7 Never Shared' })
    created.documentIds.push(shared.id, secret.id)
    const shareId = shareDocument(shared.id)
    created.shareIds.push(shareId)

    expect(portalSees('documents', `id = '${secret.id}'`), 'target hidden to begin with').toBe(0)

    asAppUser(
      { userId: SUPPLIER_USER.id, companyId: COMPANY_ID },
      `UPDATE shared_with_user SET entity_id = '${secret.id}' WHERE id = '${shareId}'`,
    )

    expect(shareTarget(shareId), 'the grant must still point where it did').toBe(shared.id)
    expect(
      portalSees('documents', `id = '${secret.id}'`),
      'and the target document must still be unreadable',
    ).toBe(0)
  })

  test('un-revoking a withdrawn grant is refused', () => {
    const doc = seedDocument({ title: 'E2E SUP-J7 Withdrawn' })
    created.documentIds.push(doc.id)
    const shareId = sqlValue(`
      INSERT INTO shared_with_user
        (company_id, user_id, entity_type, entity_id, granted_via, deleted_at, created_at, updated_at)
      VALUES ('${COMPANY_ID}', '${SUPPLIER_USER.id}', 'Document', '${doc.id}', 'MANUAL', now(), now(), now())
      RETURNING id
    `)
    created.shareIds.push(shareId)

    asAppUser(
      { userId: SUPPLIER_USER.id, companyId: COMPANY_ID },
      `UPDATE shared_with_user SET deleted_at = NULL WHERE id = '${shareId}'`,
    )

    expect(
      sqlValue(`SELECT deleted_at IS NOT NULL FROM shared_with_user WHERE id = '${shareId}'`),
      'the revocation must hold',
    ).toBe('t')
    expect(portalSees('documents', `id = '${doc.id}'`), 'and the document stays hidden').toBe(0)
  })

  test('CONTROL · a legitimate sharer can still revoke — the fix must not break sharing', () => {
    // The failure mode this fix is most at risk of is over-tightening. The
    // owner holds isOwner, which the policy admits explicitly.
    const doc = seedDocument({ title: 'E2E SUP-J7 Control' })
    created.documentIds.push(doc.id)
    const shareId = shareDocument(doc.id)
    created.shareIds.push(shareId)

    asAppUser(
      {
        userId: 'e2e10000-0000-4000-8000-000000000001', // owner@e2e.test
        companyId: COMPANY_ID,
        isOwner: true,
      },
      `UPDATE shared_with_user SET deleted_at = now() WHERE id = '${shareId}'`,
    )

    expect(
      sqlValue(`SELECT deleted_at IS NOT NULL FROM shared_with_user WHERE id = '${shareId}'`),
      'revocation by an authorised actor must still work',
    ).toBe('t')
  })
})
