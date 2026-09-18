// Shared apparatus for the `roles` journeys.
//
// Three things live here that the specs would otherwise each reinvent, and the
// first two are the reason the ROLE-J1 agreement test is possible at all.
//
//  1. THE SURFACE REGISTRY. Every control in the SPA that writes a
//     `roles_on_users` row, named, with the permission expression it gates on
//     and the file that expression lives in. Four controls, one table, one
//     policy — so all four gates must be the same expression, and that
//     expression must be the one the policy enforces. Cycle 1's escalation was
//     precisely a violation of that: four controls, three different gates, and
//     a policy that agreed with none of them.
//
//  2. A NON-DESTRUCTIVE POLICY PROBE. `sqlAsAppUser` in db.js is the right
//     shape but hard-codes `is_owner = false` and leaves its writes committed.
//     Asking "would the database permit this?" needs both fixed: the owner
//     bypass is the first branch of every policy in the schema and must be
//     testable, and a probe that mutates the tenant cannot be run against
//     shared fixtures. `probeWrite` wraps the statement in BEGIN/ROLLBACK, so
//     the answer is obtained by actually attempting the write and nothing
//     survives it.
//
//  3. Role bookkeeping — unique names and a purge that respects the audit
//     trail's immutability.
import { expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASE_URL, COMPANY_ID, ROLES, TEAMS, USERS } from './cast.js'
import { sql, sqlValue, siteGucSql } from './db.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.resolve(HERE, '../..') // qms-app/
const CONTAINER = process.env.E2E_PSQL_CONTAINER || 'qms-postgres-1'
const PG_USER = process.env.E2E_PSQL_USER || 'postgres'
const PG_DB = process.env.E2E_PSQL_DB || 'app-db'

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`

// ── 1. The surface registry ─────────────────────────────────────────────────

/**
 * The permission the `roles_on_users` INSERT/UPDATE/DELETE policies enforce.
 *
 * Written here as the EXPECTED value only so a drift is reported in words; the
 * agreement test never trusts it. It reads the live policy out of `pg_policies`
 * and, more importantly, obtains the real verdict by attempting the write.
 */
export const ROLE_ASSIGNMENT_PERMISSION = 'role_permission_management:update'

/**
 * Every SPA control that creates or removes a `roles_on_users` row.
 *
 * `gate` is the literal argument the component passes to `isAllowed()`, and
 * `gateVar`/`component` are how the agreement test proves the literal recorded
 * here is still the literal in the file.
 *
 * Every surface here is now also driven in a BROWSER by ROLE-J1's DOM layer.
 * `create-user-roles-field` used to be the exception — the note here said the
 * create dialog was USER-J8's job — and that was true of the FLOW and wrong
 * about the GATE: J8 drives the dialog as `owner`, for whom every gate is open,
 * so nothing observed the field disappearing for the persona it disappears for.
 * A gate registered but never rendered is exactly the state F-18 shipped in.
 */
export const ROLE_ASSIGNMENT_SURFACES = [
  {
    id: 'roles-users-dialog',
    label: 'Roles page → role detail → Users dialog → Save Assignments',
    component: 'src/components/roles/RoleUsersDialog.vue',
    gateVar: 'canUpdateRole',
    gate: ['role_permission_management:update'],
    // The only role-assignment surface that was already correct in cycle 1.
    wasCorrectInCycle1: true,
  },
  {
    id: 'user-detail-picker',
    label: 'User detail → Role Assignments rail → role picker',
    component: 'src/components/users/UserPageId.vue',
    gateVar: 'canAssignRoles',
    gate: ['role_permission_management:update'],
    wasCorrectInCycle1: false, // was user_management:update
  },
  {
    id: 'roster-bulk-assign',
    label: 'Users roster → select rows → bulk "Assign role"',
    component: 'src/components/users/UsersTable.vue',
    gateVar: 'canAssignRoles',
    gate: ['role_permission_management:update'],
    wasCorrectInCycle1: false, // was user_management:create
  },
  {
    id: 'create-user-roles-field',
    label: 'Users roster → Create User dialog → Roles field',
    component: 'src/components/users/UsersCreateUserDialog.vue',
    gateVar: 'canAssignRoles',
    gate: ['role_permission_management:update'],
    wasCorrectInCycle1: false, // was ungated AND mandatory — see ROLE-J1
  },
]

/**
 * Extract the permission literal a component's gate actually uses.
 *
 * A registry that records what a gate SHOULD be is a second copy of the same
 * claim, and two copies drift together. This reads the real file, so the
 * registry above is a claim the test verifies rather than an assumption it
 * inherits. A refactor that renames the variable fails loudly here, which is
 * the correct outcome — the surface must stay identifiable.
 */
export function gateLiteralOf({ component, gateVar }) {
  const file = path.join(APP_ROOT, component)
  const src = fs.readFileSync(file, 'utf8')
  const re = new RegExp(
    `const\\s+${gateVar}\\s*=\\s*computed\\(\\(\\)\\s*=>\\s*isAllowed\\(\\s*\\[([^\\]]*)\\]`,
  )
  const m = src.match(re)
  if (!m) {
    throw new Error(
      `Could not find \`const ${gateVar} = computed(() => isAllowed([...]))\` in ${component}. ` +
        `The surface registry in e2e/fixtures/roles.js is stale — update it (and check the gate ` +
        `is still a gate) rather than deleting this assertion.`,
    )
  }
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
}

// ── 2. Verdicts: what the UI offers, and what the database permits ──────────

/**
 * The persona's REAL session payload — the exact object `isAllowed()` reads.
 *
 * Deriving the UI verdict from this rather than from the seed means the test
 * measures what the browser was actually told, including the backend's implied
 * `<module>:read` materialisation, which is easy to forget and changes answers.
 */
export async function sessionOf(browser, storageState) {
  const ctx = await browser.newContext({ storageState })
  try {
    const res = await ctx.request.get(`${BASE_URL}/api/v1/auth/session`)
    expect(res.ok(), `GET /v1/auth/session → ${res.status()}`).toBeTruthy()
    const body = await res.json()
    return {
      permissions: body?.session?.permissions ?? [],
      isOwner: !!body?.session?.isOwner,
      email: body?.session?.email,
    }
  } finally {
    await ctx.close()
  }
}

/**
 * `isAllowed()` from src/utils/currentSession.js, reproduced exactly.
 *
 * Reproduced and not imported: the real one reads a module-level Vue ref that
 * only exists inside the running SPA. The risk of a copy is that it drifts, so
 * ROLE-J1 does not rely on it alone — it cross-checks this prediction against
 * the RENDERED control for every persona it visits. If the copy drifts, the
 * browser half goes red.
 */
export function uiAllows(session, needed) {
  if (session.isOwner) return true
  return needed.every((p) => session.permissions.includes(p))
}

/**
 * Attempt a write as `app_user` with a persona's session GUCs, then roll back.
 *
 * Returns `{ permitted, error }`. This is the only honest way to ask "does the
 * policy permit this?" — reading `pg_policies.qual` tells you what the policy
 * SAYS, and the whole Roles defect was a gap between what four layers said and
 * what one of them did.
 *
 * The owner flag is a parameter because `current_user_is_owner` is the first
 * short-circuit in every policy in the schema; a probe that hard-codes it false
 * cannot evaluate the owner persona at all.
 */
export function probeWrite(statement, persona, { alsoRefusedBy = null } = {}) {
  // Personas are passed around as `{ id, companyId, isOwner }` (the cast shape)
  // and occasionally as `{ userId }`. Accept both and FAIL LOUDLY on neither:
  // an undefined id silently becomes the string 'undefined', which Postgres
  // rejects while casting — and a probe that errors for the wrong reason reads
  // as "the policy refused this", which is the single most dangerous false
  // negative this file can produce. (It produced exactly that once.)
  const userId = persona?.id ?? persona?.userId
  const companyId = persona?.companyId ?? COMPANY_ID
  const isOwner = !!persona?.isOwner
  if (!userId) throw new Error('probeWrite: persona has neither `id` nor `userId`')
  const script = [
    // Derive the site GUCs BEFORE dropping to app_user — the lookup reads
    // `users`, which is itself RLS-protected and would come back empty after.
    siteGucSql(userId, companyId, false),
    'SET ROLE app_user;',
    `SELECT set_config('app.current_user_id', ${quote(userId)}, false);`,
    `SELECT set_config('app.current_company_id', ${quote(companyId)}, false);`,
    `SELECT set_config('app.current_user_is_owner', ${quote(String(!!isOwner))}, false);`,
    'BEGIN;',
    statement,
    'ROLLBACK;',
  ].join('\n')
  try {
    execFileSync(
      'docker',
      ['exec', '-i', CONTAINER, 'psql', '-U', PG_USER, '-d', PG_DB, '-v', 'ON_ERROR_STOP=1', '-tA'],
      { encoding: 'utf8', timeout: 15_000, input: script },
    )
    return { permitted: true, error: '' }
  } catch (err) {
    const error = String(err.stderr ?? err.message ?? '')
    // Only a genuine REFUSAL counts as "the write was blocked". Any other error
    // — a bad uuid, a missing column, a violated FK — would otherwise be
    // reported as a refusal, which is a false negative that makes a broken probe
    // look like a working guard. Every security assertion in this project rests
    // on this distinction, so it is enforced rather than assumed.
    //
    // `alsoRefusedBy` extends the set for guards that are NOT policies: the role
    // lock is a BEFORE UPDATE trigger raising check_violation, which is a real
    // refusal by a real control but says nothing about row-level security. The
    // caller has to name it, so a probe can never widen its own definition of
    // success by accident.
    const refused =
      /row-level security|permission denied|insufficient privilege/i.test(error) ||
      (alsoRefusedBy ? alsoRefusedBy.test(error) : false)
    if (!refused) {
      throw new Error(
        `probeWrite failed for a reason that is NOT an authorization refusal — this is a broken ` +
          `probe, not a passing guard:\n${error}`,
      )
    }
    return { permitted: false, error }
  }
}

/**
 * Would the database let this persona grant `roleId` to `targetUserId`?
 *
 * Defaults to SELF-assignment of the prize role, because that is the escalation
 * the module's two CRITICALs were: not "can they administer roles" but "can
 * they give themselves one".
 */
export function canAssignRoleInDb(persona, { roleId = ROLES.prize.id, targetUserId } = {}) {
  const target = targetUserId ?? persona.id
  return probeWrite(
    `INSERT INTO roles_on_users (user_id, role_id, company_id, created_at, updated_at)
     VALUES (${quote(target)}, ${quote(roleId)}, ${quote(COMPANY_ID)}, NOW(), NOW());`,
    persona,
  ).permitted
}

/** Would the database let this persona join `teamId` (defaults to self)? */
export function canJoinTeamInDb(persona, teamId, { targetUserId } = {}) {
  const target = targetUserId ?? persona.id
  return probeWrite(
    `INSERT INTO users_on_teams (user_id, team_id, company_id, created_at, updated_at)
     VALUES (${quote(target)}, ${quote(teamId)}, ${quote(COMPANY_ID)}, NOW(), NOW());`,
    persona,
  ).permitted
}

/**
 * The persona's effective capability, evaluated by the database itself.
 *
 * A refused INSERT only proves the INSERT failed. This is what proves the thing
 * that actually mattered — that the persona's authority never moved.
 */
export function hasCapabilityInDb(persona, module, action) {
  const script = [
    siteGucSql(persona.id, persona.companyId ?? COMPANY_ID, false),
    'SET ROLE app_user;',
    `SELECT set_config('app.current_user_id', ${quote(persona.id)}, false);`,
    `SELECT set_config('app.current_company_id', ${quote(persona.companyId ?? COMPANY_ID)}, false);`,
    `SELECT set_config('app.current_user_is_owner', ${quote(String(!!persona.isOwner))}, false);`,
    `SELECT authz.has_permission(${quote(module)}, ${quote(action)});`,
  ].join('\n')
  const out = execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', PG_USER, '-d', PG_DB, '-v', 'ON_ERROR_STOP=1', '-tA'],
    { encoding: 'utf8', timeout: 15_000, input: script },
  )
  return out.trim().split('\n').pop().trim() === 't'
}

// ── 3. Role bookkeeping ─────────────────────────────────────────────────────

/**
 * A write that fails fast instead of blocking.
 *
 * `sql()` shells out through `execFileSync`, which BLOCKS THE NODE EVENT LOOP —
 * so Playwright cannot time the test out while it waits, and a statement stuck
 * behind a lock runs past the 120 s test timeout unbounded. One observed here
 * ran for 10.1 minutes before the docker client gave up, against a database
 * another process was concurrently re-applying `rls.sql` to (policy changes take
 * ACCESS EXCLUSIVE locks on exactly these tables).
 *
 * `lock_timeout` turns that into a fast, legible failure. The same reasoning the
 * backend's migrations use — see the root CLAUDE.md on MIGRATION_LOCK_TIMEOUT.
 */
export function writeSql(statement) {
  return sql(`SET lock_timeout = '5s'; ${statement}`)
}

/** Unique, greppable role name for one test run. */
export function uniqueRoleName(tag) {
  return `E2E Role ${tag} ${Date.now()}`
}

/** Role row by exact name (E2E names are unique per run). Includes soft-deleted. */
export function findRoleByName(name) {
  const out = sql(
    `SELECT id, status_id, locked, coalesce(description,''), (deleted_at IS NOT NULL)::text
       FROM roles WHERE name = ${quote(name)} ORDER BY created_at DESC LIMIT 1`,
  )
  if (!out) return null
  const [id, statusId, locked, description, deleted] = out.split('\n')[0].split('|')
  return { id, statusId, locked: locked === 't', description, deleted: deleted === 'true' }
}

/**
 * Remove a role a test created.
 *
 * Hard DELETE is safe HERE and is not safe for users: `audit_logs.performed_by`
 * is FK RESTRICT against `users`, but `audit_logs` references a role only by
 * `entity_id`, which carries no constraint. The grants and assignments go first
 * because both FK the role.
 */
export function purgeRoleByName(name) {
  const row = findRoleByName(name)
  if (!row) return
  sql(`DELETE FROM authz.role_module_permissions WHERE role_id = ${quote(row.id)}`)
  sql(`DELETE FROM roles_on_users WHERE role_id = ${quote(row.id)}`)
  sql(`DELETE FROM roles_on_teams WHERE role_id = ${quote(row.id)}`)
  sql(`DELETE FROM workflow_step_roles WHERE role_id = ${quote(row.id)}`)
  sql(`UPDATE roles SET locked = false WHERE id = ${quote(row.id)}`)
  sql(`DELETE FROM roles WHERE id = ${quote(row.id)}`)
}

/** Live assignment count for a (user, role) pair — soft deletes excluded. */
export function assignmentCount(userId, roleId) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM roles_on_users
        WHERE user_id = ${quote(userId)} AND role_id = ${quote(roleId)} AND deleted_at IS NULL`,
    ),
  )
}

/** Live membership count for a (user, team) pair — soft deletes excluded. */
export function membershipCount(userId, teamId) {
  return Number(
    sqlValue(
      `SELECT count(*) FROM users_on_teams
        WHERE user_id = ${quote(userId)} AND team_id = ${quote(teamId)} AND deleted_at IS NULL`,
    ),
  )
}

/**
 * Put the §30 fixtures back the way the seed leaves them.
 *
 * Called by the escalation journeys, which add and remove memberships. Cheap
 * insurance: a journey that fails midway must not disarm the gate the NEXT
 * journey is asserting on.
 */
export function restoreRolesFixtures() {
  writeSql(
    `DELETE FROM users_on_teams WHERE team_id IN (${quote(TEAMS.roleCarrying.id)}, ${quote(TEAMS.plain.id)})`,
  )
  writeSql(
    `UPDATE roles_on_teams SET deleted_at = NULL WHERE team_id = ${quote(TEAMS.roleCarrying.id)}`,
  )
  // TWO statements, and the order is not optional. `roles_lock_guard` refuses
  // any UPDATE that changes a business field while the row is ALREADY locked —
  // including this one. Restoring name/description/status in the same statement
  // that sets `locked = true` works only from the unlocked state and raises
  // otherwise, so the fixture has to be unlocked first and re-locked last.
  // (The restore being blocked by the very control it restores is a neat
  // demonstration that the trigger really does bind every writer.)
  writeSql(
    `UPDATE roles SET locked = false WHERE id = ${quote(ROLES.locked.id)} AND locked = true`,
  )
  writeSql(
    `UPDATE roles SET description = 'Protected from edits — ROLE-J5 fixture.',
        name = 'E2E Locked Role', status_id = 'ACTIVE', deleted_at = NULL, locked = true
      WHERE id = ${quote(ROLES.locked.id)}`,
  )
  // The prize is held by nobody at rest — that is what makes "did they acquire
  // it?" answerable. Also drops any temporary rpm grant a control test lent to
  // another persona (ROLE-J3 borrows the roleAdmin role to build the
  // teams:update + rpm:update combination the conditional gate needs).
  writeSql(`DELETE FROM roles_on_users WHERE role_id = ${quote(ROLES.prize.id)}`)
  writeSql(
    `DELETE FROM roles_on_users
      WHERE role_id = ${quote(ROLES.roleAdmin.id)}
        AND user_id <> ${quote(USERS.roleAdmin.id)}`,
  )
}

/**
 * Lend a persona a second role for the duration of one assertion.
 *
 * Some invariants are about a COMBINATION of grants that no single seeded
 * persona holds — the users_on_teams gate is `teams:update AND (role-less OR
 * rpm:update)`, so proving the positive half needs someone with both. Seeding a
 * fifth persona for one assertion is worse than borrowing: the borrow also
 * demonstrates the CAUSAL link, because the same actor is refused before and
 * permitted after.
 */
export function withBorrowedRole(userId, roleId, fn) {
  writeSql(
    `INSERT INTO roles_on_users (user_id, role_id, company_id, created_at, updated_at)
     VALUES (${quote(userId)}, ${quote(roleId)}, ${quote(COMPANY_ID)}, NOW(), NOW())`,
  )
  try {
    return fn()
  } finally {
    writeSql(
      `DELETE FROM roles_on_users WHERE user_id = ${quote(userId)} AND role_id = ${quote(roleId)}`,
    )
  }
}
