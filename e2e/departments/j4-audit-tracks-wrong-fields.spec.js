// DEPT-J4 — What a department change records.
// FIXED. Written to fail; both reds turned green, and they were closed by work
// this module's own pack did not do — the Sites cycle rewrote the shared audit
// config, and the Sites referential-integrity migration (20260810160000) added
// the missing foreign key. This file was the thing that noticed.
//
// `backend/worker/services/audit/registry/modules/departmentSites.js` used to
// configure both tables identically:
//
//     trackFields: ['name', 'code', 'stateId']
//
// `departments` has: id, code, company_id, name, description, site_id,
// deleted_at, created_at, updated_at, supervisor_user_id.
// `sites` has:       id, company_id, name, code, address, timezone,
// deleted_at, created_at, updated_at.
//
// **Neither table has a `state_id` column.** One third of the configuration was
// dead. This is the same defect class already confirmed in the Products pack,
// where the registry also named a `stateId` that does not exist — so it is a
// pattern in how these configs get written, not a typo in one file. The
// `stateId` MECHANISM test below is KEPT and still asserts zero: the phantom is
// gone from the config, and the column it named must never appear either, or
// the config's replacement would silently start tracking something new.
//
// What that left untracked mattered more than the dead entry:
//
//   * `supervisor_user_id` — who quality events route to (see DEPT-J1)
//   * `site_id`            — which site the department belongs to
//   * `deleted_at`         — which is why deleting a site produced zero audit
//                            rows in sites/j9; a soft delete writes only this
//
// So moving a department to a different site, or changing who supervises it,
// left no trace at all: hasRelevantChanges() was false, defaultHandler returned
// null, and the event was dropped with a logger.warn at most. The config now
// tracks name, code, siteId, supervisorUserId, description and deletedAt.
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

    expect(await auditRowsAfter(DEPT_ID, before), 'a name change is recorded').toBeGreaterThan(
      before,
    )
  })

  test('changing the supervisor is audited', async ({ browser }) => {
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

  test('moving a department to another site is audited', async ({ browser }) => {
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

  test('MECHANISM · site_id is a foreign key, and a company-scoped one', () => {
    // `departments.site_id` had NO foreign key when this was written, so the
    // unaudited move above could also point a department at a site that did not
    // exist. 20260810160000 added one; 20260907400000 widened it to the
    // COMPOSITE (site_id, company_id) → sites(id, company_id), which is what
    // stops a move to another TENANT's site — a stronger property than mere
    // existence, and the one D-C1 is about. The assertion is on the definition
    // rather than the count for exactly that reason: a single-column FK would
    // still count as 1.
    const def = sqlValue(
      `SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conrelid = 'departments'::regclass AND contype = 'f'
          AND conname = 'departments_site_id_fkey'`,
    )
    expect(def, 'departments.site_id must be a foreign key').toBeTruthy()
    expect(def, 'and it must name company_id too, or a cross-tenant move is legal').toContain(
      'sites(id, company_id)',
    )
  })
})
