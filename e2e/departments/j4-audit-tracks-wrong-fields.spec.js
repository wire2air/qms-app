// DEPT-J4 — 🔴 The audit config tracks three fields, and one of them is not a
// column. WRITTEN TO FAIL.
//
// `backend/worker/services/audit/registry/modules/departmentSites.js` configures
// both tables identically:
//
//     trackFields: ['name', 'code', 'stateId']
//
// `departments` has: id, code, company_id, name, description, site_id,
// deleted_at, created_at, updated_at, supervisor_user_id.
// `sites` has:       id, company_id, name, code, address, timezone,
// deleted_at, created_at, updated_at.
//
// **Neither table has a `state_id` column.** One third of the configuration is
// dead. This is the same defect class already confirmed in the Products pack,
// where the registry also named a `stateId` that does not exist — so it is a
// pattern in how these configs get written, not a typo in one file.
//
// What that leaves untracked matters more than the dead entry:
//
//   * `supervisor_user_id` — who quality events route to (see DEPT-J1)
//   * `site_id`            — which site the department belongs to
//   * `deleted_at`         — which is why deleting a site produced zero audit
//                            rows in sites/j9; a soft delete writes only this
//
// So moving a department to a different site, or changing who supervises it,
// leaves no trace at all: hasRelevantChanges() is false, defaultHandler returns
// null, and the event is dropped with a logger.warn at most.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, SITES, COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue } from '../fixtures/db.js'

const DEPT_ID = 'e2e7d000-0000-4000-8000-00000000000d'
const CODE = 'DJ4AUD'

function auditRows(entityId) {
  return Number(sqlValue(`SELECT count(*) FROM audit_logs WHERE entity_id = '${entityId}'`))
}

/** Wait for the async audit pipeline (trigger → graphile job → audit_event.js). */
async function auditRowsAfter(entityId, before, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  let after = before
  while (Date.now() < deadline && after === before) {
    await new Promise((r) => setTimeout(r, 1_500))
    after = auditRows(entityId)
  }
  return after
}

async function patchDepartment(ctx, patch) {
  const res = await ctx.request.post('/api/graphql', {
    data: {
      query: `mutation UpdateDepartment($input: UpdateDepartmentInput!) {
        updateDepartment(input: $input) { department { id } }
      }`,
      variables: { input: { id: DEPT_ID, patch } },
    },
  })
  const body = await res.json().catch(() => null)
  expect(body?.errors ?? null, 'the write itself must succeed').toBeNull()
}

test.describe('DEPT-J4 · what a department change does and does not record', () => {
  test.beforeEach(() => {
    sql(`INSERT INTO departments (id, company_id, site_id, name, code, supervisor_user_id, created_at, updated_at)
         VALUES ('${DEPT_ID}', '${COMPANY_ID}', '${SITES.primary.id}', 'E2E DJ4 Audit Dept', '${CODE}', NULL, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET
           site_id = '${SITES.primary.id}', supervisor_user_id = NULL,
           name = 'E2E DJ4 Audit Dept', deleted_at = NULL`)
  })

  test.afterAll(() => sql(`DELETE FROM departments WHERE id = '${DEPT_ID}'`))

  test('MECHANISM · the config names a column that does not exist on either table', () => {
    const cols = sqlValue(
      `SELECT count(*) FROM information_schema.columns
        WHERE table_name IN ('departments','sites') AND column_name = 'state_id'`,
    )
    expect(
      Number(cols),
      "trackFields lists 'stateId', which is not a column on departments or sites",
    ).toBe(0)
  })

  test('CONTROL · renaming a department IS audited (must pass today)', async ({ browser }) => {
    // `name` is one of the two live tracked fields. Establishes that the trigger
    // is attached, the worker is running, and the pipeline reaches audit_logs —
    // so the silences below are about configuration, not infrastructure.
    const before = auditRows(DEPT_ID)
    const ctx = await browser.newContext({ storageState: AUTH.deptAdmin })
    await patchDepartment(ctx, { name: `E2E DJ4 Renamed ${Date.now()}` })
    await ctx.close()

    expect(await auditRowsAfter(DEPT_ID, before), 'a name change is recorded').toBeGreaterThan(before)
  })

  test('🔴 changing the supervisor is audited (FAILS TODAY)', async ({ browser }) => {
    // The routing target for quality events. Someone can redirect every future
    // event for a department to themselves and leave no record of having done it.
    const before = auditRows(DEPT_ID)
    const ctx = await browser.newContext({ storageState: AUTH.deptAdmin })
    await patchDepartment(ctx, { supervisorUserId: USERS.owner.id })
    await ctx.close()

    expect(
      sqlValue(`SELECT supervisor_user_id FROM departments WHERE id = '${DEPT_ID}'`),
      'precondition: the change really landed',
    ).toBe(USERS.owner.id)
    expect(
      await auditRowsAfter(DEPT_ID, before),
      'changing who a department routes to must be auditable',
    ).toBeGreaterThan(before)
  })

  test('🔴 moving a department to another site is audited (FAILS TODAY)', async ({ browser }) => {
    // Re-parents every record filed under it, and does so invisibly.
    const before = auditRows(DEPT_ID)
    const ctx = await browser.newContext({ storageState: AUTH.deptAdmin })
    await patchDepartment(ctx, { siteId: SITES.secondary.id })
    await ctx.close()

    expect(
      sqlValue(`SELECT site_id FROM departments WHERE id = '${DEPT_ID}'`),
      'precondition: the change really landed',
    ).toBe(SITES.secondary.id)
    expect(
      await auditRowsAfter(DEPT_ID, before),
      'moving a department between sites must be auditable',
    ).toBeGreaterThan(before)
  })

  test('MECHANISM · and there is no FK behind site_id to catch a bad move', () => {
    // `departments.site_id` has NO foreign key — only company_id and
    // supervisor_user_id do. So the unaudited move above can also point a
    // department at a site that does not exist, with nothing to stop it.
    const fks = sqlValue(
      `SELECT count(*) FROM pg_constraint
        WHERE conrelid = 'departments'::regclass AND contype = 'f'
          AND pg_get_constraintdef(oid) LIKE '%site_id%'`,
    )
    expect(Number(fks), 'departments.site_id should be a foreign key').toBe(1)
  })
})
