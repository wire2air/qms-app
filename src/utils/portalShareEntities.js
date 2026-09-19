/**
 * What `shared_with_user.entity_type` may hold — the SUPPLIER PORTAL grant.
 *
 * ⚠️ NOT the same thing as `src/utils/shareableEntities.js`, which sits one
 * directory away and shares its filename. That one mirrors
 * `backend/shared/constants/shareableEntities.js` and describes the external
 * SHARE LINK (an OTP'd public page for someone with no account, keyed by
 * `record_share_links`). This one mirrors
 * `backend/shared/sharing/sharedWithUserEntities.js` and describes a per-user grant
 * to an EXTERNAL_SUPPLIER who does have an account. The two lists differ
 * (ChangeRequest, Complaint and InspectionLot are share-linkable but not
 * portal-shareable; module keys are portal-shareable but not share-linkable),
 * so reaching for the wrong import silently mis-buckets records.
 *
 * The backend file is canonical because it is the one the DB agrees with: it
 * mirrors `shared_with_user_entity_type_chk` (migration 20260714000400) and the
 * CASE arms of `share_entity_permission()` in `database/rls.sql`, and a vitest
 * in the backend repo parses both and fails on drift. This copy exists only
 * because the frontend is not a workspace member and cannot import across the
 * repo boundary; `portalShareEntities.spec.js` reads the backend file from disk
 * and fails if this one falls behind.
 *
 * Display only. Nothing here is a permission check — visibility is decided by
 * RLS, and the SyncEngine only ever delivers rows the policies allowed.
 */

/**
 * entity_type → the SyncEngine client model that holds the record, so a grant
 * can be resolved to something renderable. `clientModel` must match the backend
 * map's `clientModel` field exactly; the spec asserts it.
 */
export const PORTAL_SHARE_ENTITIES = {
  Document: { clientModel: 'Document', label: 'Document' },
  Capa: { clientModel: 'Capa', label: 'CAPA' },
  Nonconformance: { clientModel: 'Nonconformance', label: 'Non-conformance' },
  QualityEvent: { clientModel: 'QualityEvent', label: 'Quality Event' },
  AuditInstance: { clientModel: 'AuditInstance', label: 'Audit' },
}

/** The closed half of the CHECK. Everything else must be a module key. */
export const BUILTIN_PORTAL_SHARE_TYPES = new Set(Object.keys(PORTAL_SHARE_ENTITIES))

/**
 * The open half. Admin-defined module records share under their `module_key`,
 * which `record_select_rls` matches against `records.module_key` — so the
 * entity_type of a module-record grant IS the module key, and it is always
 * snake_case (built-ins are PascalCase, so the two can never collide).
 */
export const PORTAL_SHARE_MODULE_KEY_PATTERN = /^[a-z][a-z0-9_]*$/

export function isBuiltinPortalShareType(entityType) {
  return BUILTIN_PORTAL_SHARE_TYPES.has(entityType)
}

/**
 * Note this is a POSITIVE test, not `!isBuiltinPortalShareType(...)`. The old
 * dashboard bucketed "not one of my three built-ins" into module records, so a
 * QualityEvent or AuditInstance grant was looked up in `db.Record` — a table it
 * can never be in — and rendered nowhere at all.
 */
export function isModuleKeyPortalShareType(entityType) {
  return typeof entityType === 'string' && PORTAL_SHARE_MODULE_KEY_PATTERN.test(entityType)
}
