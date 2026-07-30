// Supplier-portal E2E helpers.
//
// The portal persona is deliberately absent from USERS/AUTH (auth.setup.js logs
// in every USERS entry, and one failing portal login would take down every
// suite), so these journeys mint their own session the same way the NCR PW-J5
// journey does.
//
// Documents here are seeded by SQL rather than driven through the authoring UI:
// what is under test is the *grant*, not document authoring, and the documents
// suite already covers the lifecycle end-to-end.
import { request } from '@playwright/test'
import { BASE_URL, COMPANY_ID, PASSWORD, SUPPLIER_IDS, SUPPLIER_USER } from './cast.js'
import { sql, sqlValue } from './db.js'
// Reuse the RLS harness the sites suite established: it opens a transaction as
// `app_user` with the session GUCs the app sets, which is the only honest way
// to ask "what would this user actually see?" — `sql()` runs as superuser and
// bypasses RLS entirely.
import { asAppUser } from './sites.js'

/** A logged-in APIRequestContext for the seeded EXTERNAL_SUPPLIER portal user. */
export async function portalContext() {
  const ctx = await request.newContext({ baseURL: BASE_URL })
  const login = await ctx.post('/api/v1/auth/login', {
    data: { email: SUPPLIER_USER.email, password: PASSWORD },
  })
  if (!login.ok()) {
    throw new Error(`portal login failed for ${SUPPLIER_USER.email} → ${login.status()}`)
  }
  return ctx
}

/** An unauthenticated context — used to prove the public surface is gone. */
export function anonContext() {
  return request.newContext({ baseURL: BASE_URL })
}

let seq = 0
function uniqueSuffix() {
  // A counter, not a timestamp: two seeds inside the same millisecond are
  // routine here and a collision on doc_number would fail the insert.
  seq += 1
  return `${process.pid}-${seq}`
}

/**
 * Seed a document with one version and one section.
 * `statusId` is the VERSION status — 'EFFECTIVE' is the only one a share
 * exposes, which is what SUP-J2 exercises.
 */
export function seedDocument({ title, statusId = 'EFFECTIVE', docNumber } = {}) {
  const suffix = uniqueSuffix()
  const finalTitle = title || `E2E Supplier Doc ${suffix}`
  const finalNumber = docNumber || `ESUP-${suffix}`
  const out = sql(`
    WITH d AS (
      INSERT INTO documents (company_id, title, doc_number, created_at, updated_at)
      VALUES ('${COMPANY_ID}', '${finalTitle}', '${finalNumber}', now(), now())
      RETURNING id
    ), v AS (
      INSERT INTO document_versions
        (company_id, document_id, version_major, version_minor, status_id, created_at, updated_at)
      SELECT '${COMPANY_ID}', d.id, 1, 0, '${statusId}', now(), now() FROM d
      RETURNING id, document_id
    ), s AS (
      INSERT INTO document_sections
        (company_id, document_id, document_version_id, title, content, created_by, updated_by, created_at, updated_at)
      SELECT '${COMPANY_ID}', v.document_id, v.id, 'Scope',
             'SUPPLIER VISIBLE BODY ${suffix}',
             '${SUPPLIER_USER.id}', '${SUPPLIER_USER.id}', now(), now()
      FROM v RETURNING id
    )
    SELECT (SELECT id FROM d), (SELECT id FROM v), (SELECT id FROM s)
  `)
  const [documentId, versionId, sectionId] = out.split('|')
  return { id: documentId, versionId, sectionId, title: finalTitle, docNumber: finalNumber, bodyMarker: `SUPPLIER VISIBLE BODY ${suffix}` }
}

/** Link `from` → `to` as a REFERENCES relationship (version-to-version). */
export function linkDocuments(fromVersionId, toVersionId) {
  sql(`
    INSERT INTO document_links
      (company_id, from_document_version_id, to_document_version_id, relationship_type,
       created_by, created_at, updated_at)
    VALUES ('${COMPANY_ID}', '${fromVersionId}', '${toVersionId}', 'REFERENCES',
            '${SUPPLIER_USER.id}', now(), now())
  `)
}

/** Grant the portal user read access to a document (what the Share dialog writes). */
export function shareDocument(documentId, userId = SUPPLIER_USER.id) {
  return sqlValue(`
    INSERT INTO shared_with_user
      (company_id, user_id, entity_type, entity_id, granted_via, created_at, updated_at)
    VALUES ('${COMPANY_ID}', '${userId}', 'Document', '${documentId}', 'MANUAL', now(), now())
    RETURNING id
  `)
}

/** Revoke as the UI does — soft delete, so the withdrawal stays in the audit trail. */
export function revokeShare(shareId) {
  sql(`UPDATE shared_with_user SET deleted_at = now(), updated_at = now() WHERE id = '${shareId}'`)
}

/** A PENDING single-item asset request for the portal supplier. */
export function seedAssetRequest({ title } = {}) {
  const suffix = uniqueSuffix()
  const finalTitle = title || `E2E Doc Request ${suffix}`
  const out = sql(`
    WITH r AS (
      INSERT INTO asset_requests
        (company_id, supplier_id, title, status_id, created_by, created_at, updated_at)
      VALUES ('${COMPANY_ID}', '${SUPPLIER_IDS.withPortal}', '${finalTitle}', 'PENDING',
              'e2e10000-0000-4000-8000-000000000001', now(), now())
      RETURNING id
    ), i AS (
      INSERT INTO asset_request_items
        (company_id, asset_request_id, custom_title, status_id, created_at, updated_at)
      SELECT '${COMPANY_ID}', r.id, 'ISO 9001 Certificate', 'PENDING', now(), now() FROM r
      RETURNING id
    )
    SELECT (SELECT id FROM r), (SELECT id FROM i)
  `)
  const [requestId, itemId] = out.split('|')
  return { id: requestId, itemId, title: finalTitle }
}

/** Remove everything a journey created, newest-first (FK order). */
export function cleanup({ documentIds = [], shareIds = [], assetRequestIds = [] } = {}) {
  for (const id of shareIds) sql(`DELETE FROM shared_with_user WHERE id = '${id}'`)
  for (const id of assetRequestIds) {
    sql(`DELETE FROM asset_request_items WHERE asset_request_id = '${id}'`)
    sql(`DELETE FROM asset_requests WHERE id = '${id}'`)
  }
  for (const id of documentIds) {
    sql(`DELETE FROM document_links dl USING document_versions dv
         WHERE (dl.from_document_version_id = dv.id OR dl.to_document_version_id = dv.id)
           AND dv.document_id = '${id}'`)
    sql(`DELETE FROM shared_with_user WHERE entity_type = 'Document' AND entity_id = '${id}'`)
    sql(`DELETE FROM document_sections WHERE document_id = '${id}'`)
    sql(`DELETE FROM document_versions WHERE document_id = '${id}'`)
    sql(`DELETE FROM documents WHERE id = '${id}'`)
  }
}

/**
 * How many rows of `table` the portal user can see for `where`, under RLS.
 * Returns a number so a caller can assert 1 (visible) or 0 (hidden) without
 * caring which policy branch decided.
 */
export function portalSees(table, where, userId = SUPPLIER_USER.id) {
  const out = asAppUser(
    { userId, companyId: COMPANY_ID },
    `SELECT count(*) FROM ${table} WHERE ${where}`,
  )
  return Number(out.trim())
}

/** The same question for the admin/owner side — proves a row exists at all. */
export function existsInDb(table, where) {
  return Number(sqlValue(`SELECT count(*) FROM ${table} WHERE ${where}`))
}
