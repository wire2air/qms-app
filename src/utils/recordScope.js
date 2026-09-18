/**
 * The client-side mirror of authz.scope_allowed.
 *
 * Kept as a pure function over an explicit session so it can be tested on its
 * own — importing currentSession.js pulls in the syncEngine/decorator graph,
 * which the test transform can't process. currentSession.js binds this to the
 * live session as `isAllowedOnRecord`; that binding is what components call.
 */

// Mirrors authz.access_scopes.rank. Higher reaches further.
export const SCOPE_RANK = { OWN: 1, DEPARTMENT: 2, SITE: 3, TENANT: 4 }

/**
 * May this user act on THIS record — not merely somewhere in the module?
 *
 * `isAllowed` answers the scope-blind half: do you hold capa:update at all. It
 * cannot tell a grant at `own` from one at `tenant`, so a page gated on it
 * alone offers an edit control on every record in the module and lets the
 * database refuse the save. This answers the other half.
 *
 * The arithmetic mirrors authz.scope_allowed line for line:
 *
 *   RETURN (v_rank >= 4)
 *       OR (v_rank >= 3 AND p_site  IS NOT NULL AND p_site = ANY (v_usites))
 *       OR (v_rank >= 2 AND p_dept  IS NOT NULL AND p_dept  = v_udept)
 *       OR (v_rank >= 1 AND p_owner IS NOT NULL AND p_owner = v_user);
 *
 * The IS NOT NULL guards carry real weight. In SQL a NULL record attribute
 * cannot match anything, including a NULL of the user's; in JS
 * `undefined === undefined` is true, so each tier tests the record's attribute
 * for truthiness first. Without that, a record with no department would be
 * editable by every user who also has no department.
 *
 * Verified against scope_allowed over every CAPA for four users with no
 * divergence — see migration 20260819100000-effective-permission-scopes.js.
 *
 * ── This is a hint, not a gate ──────────────────────────────────────────────
 * RLS and the REST controllers (backend utils/recordAccess.js) decide. Getting
 * this wrong shows a control that shouldn't be there — the save then fails
 * loudly by design, see syncEngine/core/directSaveStrategy.js — or hides one
 * that should. It grants nothing. Never make it the only check on a
 * destructive action.
 *
 * @param {object|null} session     currentSession.value
 * @param {string}      permission  e.g. 'capa:update'
 * @param {object|null} record      needs ownerId / departmentId / siteId
 * @param {object}     [opts]
 * @param {string}     [opts.ownerField]  when the custodian is not `ownerId`
 * @returns {boolean}
 */
export function scopeAllows(session, permission, record, opts = {}) {
  if (!session || !record) return false

  // Owners bypass the matrix outright, matching isAllowed and the RLS policies.
  if (session.isOwner) return true

  const rank = session.permissionScopes?.[permission] ?? 0
  if (rank >= SCOPE_RANK.TENANT) return true

  if (rank >= SCOPE_RANK.SITE) {
    const mySites = session.siteIds || []
    if (record.siteId && mySites.includes(record.siteId)) return true
  }

  if (rank >= SCOPE_RANK.DEPARTMENT) {
    if (record.departmentId && record.departmentId === session.departmentId) return true
  }

  if (rank >= SCOPE_RANK.OWN) {
    const owner = record[opts.ownerField || 'ownerId']
    if (owner && owner === session.id) return true
  }

  return false
}
