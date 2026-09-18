// DEPT-J1 — A department created over REST can now route a quality event.
// FIXED 2026-09-07 (D-H1). This suite was written to fail; the two tests marked
// 🔴 below are the ones that turned green, and they are kept as the regression
// guard rather than deleted.
//
// This is the module's headline finding and the only one in either org-structure
// module that reaches a user-visible hard error rather than a silent gap.
//
// THE CHAIN, in three links:
//
//  1. `departments.supervisor_user_id` is a real column with a real FK to
//     `users`, and the UI writes it — DepartmentsCreateUpdateDialog.vue binds a
//     UserSelectMenu at :246 and persists it at :156/:167 through the
//     syncEngine (GraphQL).
//  2. The REST Zod schemas did not mention it. `createDepartmentSchema` accepted
//     name/code/siteId/description/displayOrder; `updateDepartmentSchema`
//     accepted name/siteId/description/displayOrder. Zod strips unknown keys, so
//     a POST carrying supervisorUserId was accepted, ignored, and the column
//     landed NULL. No error, no warning. THE FIX had to be three things, not the
//     "two lines in one schema file" this file originally predicted: the field
//     added to both schemas, the controller's destructuring widened to read it,
//     and — because `departments.supervisor_user_id` referenced `users(id)` with
//     no company predicate — the value resolved against the caller's company
//     before it is stored. Simply forwarding it would have opened D-C1, letting
//     a REST client name another tenant's user as supervisor.
//  3. `controllers/qualityEvents.js:144-151` routes an unassigned event to
//     `department.supervisorUserId`, and throws BadRequestError — "No supervisor
//     is configured for this department at the selected site" — when it is NULL.
//
// So any department created by a non-UI consumer (integration, API key, script,
// bulk import) was silently unable to receive a routed quality event, and the
// person who found out was whoever filed the event.
//
// A NOTE ON HOW THIS WAS FOUND. Three parallel sweeps independently concluded
// "supervisorUserId has no write path after bootstrap". All three were wrong,
// and wrong the same way: they grepped REST controllers and Zod schemas in an
// application where entity CRUD is majority-GraphQL. The narrower finding —
// REST specifically cannot set it — is what survived verification, and it is
// what this journey asserts.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, SITES, DEPARTMENTS, COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'

const API = 'http://e2elab.localhost:4000'
const DEPTS = `${API}/v1/services/departments`
const EVENTS = `${API}/v1/services/qualityEvents`

// `departments.code` is varchar(10) — a longer generated code 500s on insert
// and reads like a permission failure in the response.
const stamp = () => String(Date.now()).slice(-6)

function purgeDept(code) {
  sql(
    `DELETE FROM quality_events WHERE department_id IN (SELECT id FROM departments WHERE code = '${code}')`,
  )
  sql(`DELETE FROM departments WHERE code = '${code}'`)
}

test.describe('DEPT-J1 · supervisorUserId over REST', () => {
  test('PRECONDITION · the seeded Quality department has a supervisor', () => {
    // The control path for everything below: if this row lost its supervisor,
    // the two CONTROL tests would fail for a reason that has nothing to do with
    // what this file is about.
    expect(
      sqlValue(`SELECT supervisor_user_id FROM departments WHERE id = '${DEPARTMENTS.quality.id}'`),
      'the seeded Quality department has a supervisor (the control path)',
    ).toBe(USERS.owner.id)
  })

  test('POST /departments persists a supervisor when one is supplied', async ({ browser }) => {
    const code = `D1A${stamp()}`
    const ctx = await browser.newContext({ storageState: AUTH.deptAdmin })

    try {
      const res = await ctx.request.post(DEPTS, {
        data: {
          name: `E2E DJ1 With Supervisor ${code}`,
          code,
          siteId: SITES.primary.id,
          supervisorUserId: USERS.owner.id,
        },
      })
      expect([200, 201], 'the create itself is accepted').toContain(res.status())

      expect(
        sqlValue(
          `SELECT coalesce(supervisor_user_id::text, 'NULL') FROM departments WHERE code = '${code}'`,
        ),
        'a supervisor supplied over REST must be stored',
      ).toBe(USERS.owner.id)
    } finally {
      await ctx.close()
      purgeDept(code)
    }
  })

  test('a quality event routes to a REST-created department', async ({ browser }) => {
    // The consequence, end to end. This is what an operator actually hits.
    const code = `D1B${stamp()}`
    const ctx = await browser.newContext({ storageState: AUTH.deptAdmin })

    try {
      const created = await ctx.request.post(DEPTS, {
        data: {
          name: `E2E DJ1 Routing ${code}`,
          code,
          siteId: SITES.primary.id,
          supervisorUserId: USERS.owner.id,
        },
      })
      expect([200, 201]).toContain(created.status())
      const deptId = sqlValue(`SELECT id FROM departments WHERE code = '${code}'`)
      expect(deptId, 'department was created').toBeTruthy()

      // No assignedToUserId — so the event must route to the department's
      // supervisor. That is the whole point of configuring one.
      const event = await ctx.request.post(EVENTS, {
        data: {
          title: `E2E DJ1 routed event ${code}`,
          description: 'Routes to the department supervisor.',
          siteId: SITES.primary.id,
          departmentId: deptId,
        },
      })

      const body = await event.json().catch(() => null)
      expect(
        [200, 201],
        `event creation must succeed — got: ${body?.error?.message ?? event.status()}`,
      ).toContain(event.status())
    } finally {
      await ctx.close()
      purgeDept(code)
    }
  })

  test('CONTROL · the same event routes fine to a department that HAS a supervisor', async ({
    browser,
  }) => {
    // Decisive. Same endpoint, same payload shape, same actor — only the
    // department differs. So the failure above is the missing column, not
    // broken routing, not a missing grant, and not a bad request.
    const ctx = await browser.newContext({ storageState: AUTH.deptAdmin })
    const title = `E2E DJ1 control event ${stamp()}`

    try {
      const event = await ctx.request.post(EVENTS, {
        data: {
          title,
          description: 'Control — department supervisor is populated.',
          siteId: SITES.primary.id,
          departmentId: DEPARTMENTS.quality.id,
        },
      })
      const body = await event.json().catch(() => null)
      expect([200, 201], `control must pass: ${body?.error?.message ?? ''}`).toContain(
        event.status(),
      )
    } finally {
      await ctx.close()
      sql(`DELETE FROM quality_events WHERE title = '${title.replace(/'/g, "''")}'`)
    }
  })

  test('CONTROL · GraphQL CAN set the supervisor (must pass today)', async ({ browser }) => {
    // The UI path always worked, which is why the REST gap survived: everyone
    // who ever set a supervisor did it through the dialog. Kept after the fix
    // because it is what notices if someone "simplifies" the module by routing
    // the dialog through REST — the two paths must both work, and DEPT-J5 pins
    // that the dialog still uses GraphQL.
    const code = `D1C${stamp()}`
    const id = sqlValue(`SELECT gen_random_uuid()`)

    try {
      sql(`INSERT INTO departments (id, company_id, site_id, name, code, created_at, updated_at)
           VALUES ('${id}', '${COMPANY_ID}', '${SITES.primary.id}', 'E2E DJ1 GraphQL ${code}', '${code}', NOW(), NOW())`)

      const ctx = await browser.newContext({ storageState: AUTH.deptAdmin })
      const res = await ctx.request.post('/api/graphql', {
        data: {
          query: `mutation UpdateDepartment($input: UpdateDepartmentInput!) {
            updateDepartment(input: $input) { department { id supervisorUserId } }
          }`,
          variables: { input: { id, patch: { supervisorUserId: USERS.owner.id } } },
        },
      })
      const body = await res.json().catch(() => null)
      expect(body?.errors ?? null, 'the GraphQL write is accepted').toBeNull()
      await ctx.close()

      expect(
        sqlValue(
          `SELECT coalesce(supervisor_user_id::text,'NULL') FROM departments WHERE id = '${id}'`,
        ),
        'GraphQL persists what REST drops',
      ).toBe(USERS.owner.id)
    } finally {
      purgeDept(code)
    }
  })
})
