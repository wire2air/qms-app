// Shared fixtures for the `permissions` project — the cross-cutting module that
// decides, for every other module, who may do what.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS SUITE EXISTS
//
// Until this file there was no Playwright project for permissions at all, and
// the module's own production-readiness doc says why that matters more here
// than anywhere else: `docs/modules/permissions/19-production-readiness.md`
// scored Automation 66 and QA 42 against two hard zeros — no `permissions`
// project among the (then) 41 in `playwright.config.js`, and
// `AUTHZ_VERBS_ENABLED` never once run true. The decision engine is the
// best-tested part of this system (151 integration tests in
// `backend/api/tests/integration/authz/`) and the enforcement WIRING was the
// least-tested. The engine tests call the SQL functions directly; nothing
// asserted that a role grant changes what a browser can actually do.
//
// ─────────────────────────────────────────────────────────────────────────────
// EVERY PROBE IS TWO-SIDED. THIS IS NOT OPTIONAL HERE.
//
// An RLS refusal is a ZERO-ROW SUCCESS, not an error — nothing throws and
// nothing 403s, the policy simply matches no rows. So a one-sided "the denied
// persona sees nothing" assertion passes identically when the seed did not
// apply, when the stack is down, when the table is empty, and when the policy
// was deleted outright. It is worth nothing on its own.
//
// So every denial here is paired with a grant reading THE SAME ROW in the same
// run, and the ground truth is taken first with RLS bypassed. Three numbers,
// never one: what the table holds, what a granted persona sees, what a denied
// persona sees. This is the same posture as `e2e/auditLogs/a1-read-gate.spec.js`
// and it is inherited deliberately.
//
// PM-R0, from the module's manual QA guide (`12-manual-qa-guide.md`): never
// assert "the list is empty". Assert that a KNOWN-EXISTING row is absent for
// the persona and present for a control. `expectRowVisibility` is that rule
// expressed once so no journey has to remember it.
//
// ─────────────────────────────────────────────────────────────────────────────
// PERSONA GRANTS AS MEASURED ON app-db (2026-09-17, after the e2e seed applied)
//
//   persona      effective grants   the property this suite uses it for
//   noaccess              0         a TRUE zero — the clean denial side
//   teamsonly             2         teams:create/read, reached DIRECTLY (below)
//   ownauthor            17         document_control CRUD, a narrow-scope holder
//   reviewer             22         capa/ncr/change_control read+update, NO delete
//   author               62         the control side for most create/read probes
//
// `reviewer` is the persona the delete journeys are built on because it holds
// exactly `capa:read` + `capa:update` and NOT `capa:delete` — the "author, not
// approver" shape, which the security review calls the most common non-admin
// role in live data, and the only shape that can distinguish an update gate
// from a delete gate.
//
// ⚠️ `teamsonly@e2e.test` IS A MISNOMER. It holds the `E2E Teams Only` role
// DIRECTLY (`roles_on_users`) and belongs to no team — verified 2026-09-17 by
// the MTC-00 triage query. The module's journey spec (PERM-J8) assumed the
// opposite. So the team-grant journey does not rely on the seed's wiring: it
// puts the user into `E2E Role-Carrying Team` itself, asserts, and removes it
// again. See `joinRoleCarryingTeam`.
import { expect } from '@playwright/test'
import { sql, sqlAsAppUser, sqlValue } from './db.js'
import { COMPANY_ID } from './cast.js'

/**
 * Last non-empty line of a `sqlAsAppUser` result.
 *
 * `sqlAsAppUser` prepends its own session setup to every script — a `DO` block
 * for the site GUCs, a `SET ROLE`, and three `set_config` SELECTs — so the
 * value a probe asked for is the LAST line, not the first. Reading `output`
 * directly is the mistake this helper exists to prevent: `'DO\nSET\n…\n0'` is a
 * truthy string and a probe that compares it to `'0'` silently never matches.
 */
export function appUserValue(result) {
  const lines = String(result.output ?? '')
    .trim()
    .split('\n')
    .filter((l) => l !== '')
  return lines.length ? lines[lines.length - 1].trim() : ''
}

/** Count a single known row as `userId` would see it, through RLS. */
export function countVisibleAsUser(table, rowId, userId, companyId = COMPANY_ID) {
  const r = sqlAsAppUser(`SELECT count(*) FROM ${table} WHERE id = '${rowId}';`, {
    userId,
    companyId,
  })
  return Number(appUserValue(r))
}

/**
 * PM-R0 as a single call: assert a NAMED row is visible to the granted persona
 * and invisible to the denied one, having first established that the row is
 * really there with RLS bypassed.
 *
 * The ground-truth assertion is the one that makes the other two mean
 * something. Without it a passing test proves only that the row is missing for
 * everybody.
 */
export function expectRowVisibility(table, rowId, { granted, denied, label = table }) {
  const truth = Number(sqlValue(`SELECT count(*) FROM ${table} WHERE id = '${rowId}'`))
  expect(truth, `${label}: ground truth — the row exists with RLS bypassed`).toBe(1)

  const seenByGranted = countVisibleAsUser(table, rowId, granted.id)
  expect(seenByGranted, `${label}: ${granted.email} holds the read and must see the row`).toBe(1)

  const seenByDenied = countVisibleAsUser(table, rowId, denied.id)
  expect(seenByDenied, `${label}: ${denied.email} holds no read and must see nothing`).toBe(0)
}

/** Does this user hold `module:action` after roles, teams and scope resolve? */
export function holdsPermission(userId, permission, companyId = COMPANY_ID) {
  return (
    sqlValue(
      `SELECT '${permission}' = ANY(authz.effective_permission_strings('${userId}','${companyId}'))`,
    ) === 't'
  )
}

/** Every permission string the engine resolves for a user, sorted. */
export function effectivePermissions(userId, companyId = COMPANY_ID) {
  const out = sqlValue(
    `SELECT coalesce(string_agg(p.s, ' ' ORDER BY p.s), '') FROM unnest(authz.effective_permission_strings('${userId}','${companyId}')) p(s)`,
  )
  return out ? out.split(' ') : []
}

/**
 * Attempt a soft delete the way the SPA does it, and report whether the
 * database allowed it.
 *
 * THE WHOLE POINT OF THIS SHAPE. A paranoid `delete()` in the syncEngine sets
 * the tombstone and then switches the operation to an UPDATE
 * (`syncEngine/core/BaseModel.js`), so the wire mutation is
 * `UPDATE … SET deleted_at` and Postgres evaluates the table's *_upd* policy —
 * which asks for `:update`. The `*_delete_rls` policy is never reached from the
 * browser at all. That was finding F-27, and it meant every delete permission
 * was unreachable on the GraphQL path.
 *
 * It is now closed by a `BEFORE UPDATE OF deleted_at` trigger over 29 tables
 * (`enforce_soft_delete_permission`), so this helper probes the trigger, not
 * the DELETE policy. Asserting `deleted_at IS NULL` afterwards is what
 * separates "refused" from "refused and also rolled back".
 */
export function attemptSoftDelete(table, rowId, userId, companyId = COMPANY_ID) {
  const r = sqlAsAppUser(`UPDATE ${table} SET deleted_at = now() WHERE id = '${rowId}';`, {
    userId,
    companyId,
  })
  const stillLive = sqlValue(`SELECT deleted_at IS NULL FROM ${table} WHERE id = '${rowId}'`) === 't'
  return { allowed: r.ok, error: r.error, stillLive }
}

/** The `E2E Role-Carrying Team` → `E2E Prize Role` → `sites:delete` chain. */
export const PRIZE_PERMISSION = 'sites:delete'

/**
 * Put a user into `E2E Role-Carrying Team` and return an undo function.
 *
 * The team is seeded with the `E2E Prize Role` attached and NO members, which
 * makes it the right instrument for the union property: the prize permission is
 * held by nobody until this runs, so observing it appear cannot be a leftover.
 *
 * `company_id` is NOT NULL on `users_on_teams` and is part of the composite
 * cross-tenant seal — omitting it fails the insert outright, which is the first
 * thing that went wrong when this was written.
 */
export function joinRoleCarryingTeam(userId, companyId = COMPANY_ID) {
  const teamId = sqlValue(
    `SELECT id FROM teams WHERE name = 'E2E Role-Carrying Team' AND company_id = '${companyId}' AND deleted_at IS NULL`,
  )
  if (!teamId) throw new Error('E2E Role-Carrying Team is missing — has e2e-seed.sql been applied?')
  sql(
    `INSERT INTO users_on_teams (id, user_id, team_id, company_id, created_at, updated_at)
     VALUES (gen_random_uuid(), '${userId}', '${teamId}', '${companyId}', now(), now())`,
  )
  return () => sql(`DELETE FROM users_on_teams WHERE user_id = '${userId}' AND team_id = '${teamId}'`)
}

/**
 * Grant a role a module/action directly, returning an undo function.
 *
 * Used by the journeys that need to observe a permission CHANGE rather than a
 * static state (live revocation, the union of direct and team grants). Scope is
 * spelled out by the caller because a grant's tier is exactly what several of
 * these journeys are about.
 */
export function grantToRole(roleName, moduleId, actionId, scopeId = 'tenant', companyId = COMPANY_ID) {
  const roleId = sqlValue(
    `SELECT id FROM roles WHERE name = '${roleName}' AND company_id = '${companyId}' AND deleted_at IS NULL`,
  )
  if (!roleId) throw new Error(`role not found: ${roleName}`)
  // `company_id` is NOT NULL and part of the composite cross-tenant seal, the
  // same shape `users_on_teams` carries. Omitting it fails the insert outright.
  sql(
    `INSERT INTO authz.role_module_permissions (role_id, company_id, module_id, action_id, scope_id)
     VALUES ('${roleId}', '${companyId}', '${moduleId}', '${actionId}', '${scopeId}')
     ON CONFLICT DO NOTHING`,
  )
  return () =>
    sql(
      `DELETE FROM authz.role_module_permissions
        WHERE role_id = '${roleId}' AND module_id = '${moduleId}' AND action_id = '${actionId}'`,
    )
}

/** Actions registered for a module in the catalog, sorted. */
export function registeredActions(moduleId) {
  const out = sqlValue(
    `SELECT coalesce(string_agg(action_id, ' ' ORDER BY action_id), '') FROM authz.module_actions WHERE module_id = '${moduleId}'`,
  )
  return out ? out.split(' ') : []
}
