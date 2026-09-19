// PERM-J4 — grants reach a user through teams, and grants are a UNION.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS THE SECOND-MOST-USEFUL THING TO TEST IN THIS MODULE
//
// The module's triage guide (`12-manual-qa-guide.md`, MTC-00) says to run this
// query FIRST on any report of the form "X can do Y without permission",
// because two answers explain almost every such report: the account is a
// company owner, or a SECOND role reaches the user through a team and nobody
// looked past the direct assignment. Permissions are the union of every role
// reaching a user by any path; a role page that shows only direct assignments
// makes that union invisible.
//
// So the property under test is not "teams work" but "teams ADD, and removing
// one path does not remove access granted by another".
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THE SPEC'S PERSONA WAS WRONG, AND THE SEED IS THE REASON
//
// `14-playwright-journeys.md` PERM-J8 builds this on `teamsonly@e2e.test`,
// described as holding its grants THROUGH a team. Measured on app-db
// 2026-09-17 with the MTC-00 triage query, that user reaches `E2E Teams Only`
// DIRECTLY via `roles_on_users` and belongs to NO team:
//
//     via     | role
//     --------+-----------------
//     direct  | E2E Teams Only
//
// Writing the journey as specified would have produced a test that passes while
// asserting nothing about teams — the worst kind of green.
//
// So this file builds the team path itself. The seed ships
// `E2E Role-Carrying Team` with `E2E Prize Role` attached and NO MEMBERS, which
// is the right instrument precisely because the prize permission
// (`sites:delete`) is held by nobody at rest: observing it appear cannot be a
// leftover from another suite, and observing it vanish cannot be a coincidence.
//
// Verified by execution before this file was written (f → t → f).
import { test, expect } from '@playwright/test'
import { COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'
import { PRIZE_PERMISSION, holdsPermission, joinRoleCarryingTeam } from '../fixtures/permissions.js'

const uid = (email) => sqlValue(`SELECT id FROM users WHERE email = '${email}'`)

let subject

test.beforeAll(() => {
  subject = uid(USERS.teamsOnly.email)
  expect(subject, 'teamsonly@e2e.test is seeded').toBeTruthy()
})

// Leave no trace even if an assertion throws mid-test: a stray team membership
// silently widens this persona for every other suite that uses it.
test.afterEach(() => {
  const teamId = sqlValue(
    `SELECT id FROM teams WHERE name = 'E2E Role-Carrying Team' AND company_id = '${COMPANY_ID}'`,
  )
  if (teamId) sql(`DELETE FROM users_on_teams WHERE user_id = '${subject}' AND team_id = '${teamId}'`)
  const roleId = sqlValue(
    `SELECT id FROM roles WHERE name = 'E2E Teams Only' AND company_id = '${COMPANY_ID}'`,
  )
  if (roleId) {
    sql(
      `DELETE FROM authz.role_module_permissions
        WHERE role_id = '${roleId}' AND module_id = 'sites' AND action_id = 'delete'`,
    )
  }
})

test.describe('PERM-J4 — the union of every path that reaches a user', () => {
  test('the prize permission is held by nobody at rest — the premise', () => {
    // If this fails, every other case here is measuring a leftover.
    expect(
      holdsPermission(subject, PRIZE_PERMISSION),
      `${PRIZE_PERMISSION} must not be held before the team is joined`,
    ).toBe(false)
  })

  test('joining a role-carrying team grants access; leaving it takes access away', () => {
    const leave = joinRoleCarryingTeam(subject)
    try {
      expect(
        holdsPermission(subject, PRIZE_PERMISSION),
        'the team\'s role reaches the user — a grant with no direct assignment',
      ).toBe(true)
    } finally {
      leave()
    }

    expect(
      holdsPermission(subject, PRIZE_PERMISSION),
      'leaving the team withdraws the grant',
    ).toBe(false)
  })

  test('two paths, one revoked: access PERSISTS — this is the report MTC-00 exists to explain', () => {
    // THE CASE THAT MATTERS. A direct grant and a team grant for the same
    // permission are independent; revoking the visible one leaves the other
    // standing. Someone looking only at the user's direct roles concludes the
    // permission was removed, and the user still has it. That is the shape of
    // nearly every "X can still do Y" bug report in this module's history.
    const roleId = sqlValue(
      `SELECT id FROM roles WHERE name = 'E2E Teams Only' AND company_id = '${COMPANY_ID}' AND deleted_at IS NULL`,
    )
    expect(roleId, 'the direct role exists').toBeTruthy()

    const leave = joinRoleCarryingTeam(subject)
    try {
      // Path 2: the same permission, granted directly on the role the user
      // already holds.
      sql(
        `INSERT INTO authz.role_module_permissions (role_id, company_id, module_id, action_id, scope_id)
         VALUES ('${roleId}', '${COMPANY_ID}', 'sites', 'delete', 'tenant') ON CONFLICT DO NOTHING`,
      )
      expect(holdsPermission(subject, PRIZE_PERMISSION), 'held via both paths').toBe(true)

      // Revoke the DIRECT one only.
      sql(
        `DELETE FROM authz.role_module_permissions
          WHERE role_id = '${roleId}' AND module_id = 'sites' AND action_id = 'delete'`,
      )

      expect(
        holdsPermission(subject, PRIZE_PERMISSION),
        'the team path still grants it — revoking one path is not revoking access',
      ).toBe(true)
    } finally {
      leave()
    }

    expect(
      holdsPermission(subject, PRIZE_PERMISSION),
      'with both paths gone, access is finally gone',
    ).toBe(false)
  })

  test('the triage query in the QA guide really does reveal both paths', () => {
    // MTC-00 step 2 is only useful if it surfaces the team path. This asserts
    // the documented query returns what the guide claims, so the runbook and
    // the schema cannot drift apart silently.
    const leave = joinRoleCarryingTeam(subject)
    try {
      const rows = sqlValue(
        `SELECT count(*) FROM (
           SELECT r.id FROM roles_on_users ru JOIN roles r ON r.id = ru.role_id
            WHERE ru.user_id = '${subject}' AND ru.deleted_at IS NULL
           UNION ALL
           SELECT r.id FROM users_on_teams ut
             JOIN roles_on_teams rt ON rt.team_id = ut.team_id AND rt.deleted_at IS NULL
             JOIN roles r ON r.id = rt.role_id
            WHERE ut.user_id = '${subject}' AND ut.deleted_at IS NULL
         ) paths`,
      )
      expect(
        Number(rows),
        'the triage query sees BOTH the direct role and the team role',
      ).toBe(2)
    } finally {
      leave()
    }
  })
})
