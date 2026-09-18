// ALD-A3 — one real record change, followed the whole way to the page.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS JOURNEY IS THE ONE THAT CAN'T BE FAKED
//
// Everything else in this suite asks "who may read the trail". This one asks
// whether there is a trail to read — and the answer runs through four hops, any
// of which can fail silently:
//
//   1. `departments_audit_trigger` fires and ENQUEUES. It does NOT write
//      `audit_logs`; it calls `graphile_worker.add_job('audit_event')`. A
//      single-shot SELECT straight after the DML races the hop and reads as
//      "not audited", which is why every assertion here sits behind
//      `waitForAuditRow`.
//   2. The worker's registry decides what survives. `getTableConfig()` hands an
//      unregistered table `DEFAULT_CONFIG` — `['statusId','stateId','name',
//      'title','code']`, camelCase, matched after `keysToCamelCase()`. A table
//      none of whose columns are in its trackFields logs INSERT/DELETE as a bare
//      `{id}` and drops every UPDATE, because `hasRelevantChanges()` returns
//      false. 23-hardening-pass §9 found 24 such phantom fields across 53
//      configured tables, two of them TOTAL blackouts.
//   3. `audit_log_select_rls` decides whether the row syncs at all (ALD-A1).
//   4. `AuditLogsItem` resolves the row's subject out of IndexedDB and renders
//      `v-if="resolvedEntity"` — a null resolve deletes the row from the DOM.
//
// Hop 2 is why the negative control below matters as much as the positive one.
// "The audit trail recorded something" is not the property; "the audit trail
// recorded the field that changed, and only when a tracked field changed" is.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT WAS MEASURED TO JUSTIFY THE ASSERTIONS (app-db, 2026-09-01)
//
// Driving `departments` directly, as the owner:
//
//   INSERT                       → CREATE, new_value_json =
//       {id, code, name, siteId, deletedAt, description, supervisorUserId}
//       — the full tracked snapshot, old_value_json NULL.
//   UPDATE description           → UPDATE, old = {"description": "…"},
//       new = {"description": "…"} — the CHANGED FIELD ONLY, not a row dump.
//   UPDATE updated_at ALONE      → NOTHING. No audit row, ever.
//                                  (`ignoreFields: ['updatedAt','createdAt']`)
//   DELETE                       → DELETE, old_value_json = the snapshot.
//
// `entity_type` came back as **`Departments`** — the PascalCase PLURAL of the
// table. That is the trigger's stamp, and it is deliberately NOT the singular
// the ~14 controllers that pass an explicit entityType write. Both forms are
// canonicalised by `audit_entity_types` + `audit_entity_type_aliases`; ALD-A4
// tests that half. Here it is asserted literally, because it is the input the
// canonicaliser is given and a change to it breaks the mapping for every
// trigger-written row in the table (half of them, historically).
import { test, expect } from '@playwright/test'
import { AUTH, USERS } from '../fixtures/cast.js'
import { sql, sqlRow, sqlValue } from '../fixtures/db.js'
import {
  PROBE_DEPARTMENTS,
  TRAIL_SYNC_TIMEOUT,
  auditRows,
  dbNow,
  gotoAuditLogs,
  seedProbeDepartment,
  touchProbeDepartment,
  trailRowsInTable,
  waitForAuditRow,
} from '../fixtures/auditLogs.js'

const DEPT = PROBE_DEPARTMENTS.primary

/** One audit row, as the table holds it. */
function auditRow(entityId, action, since) {
  const row = sqlRow(
    `SELECT entity_type, action, performed_by,
            coalesce(old_value_json::text, ''), coalesce(new_value_json::text, '')
       FROM audit_logs
      WHERE entity_id = '${entityId}' AND action = '${action}' AND created_at > '${since}'
      ORDER BY created_at DESC LIMIT 1`,
  )
  expect(row, `an audit row exists for ${action} ${entityId}`).not.toBeNull()
  return {
    entityType: row[0],
    action: row[1],
    performedBy: row[2] || null,
    oldValue: row[3] ? JSON.parse(row[3]) : null,
    newValue: row[4] ? JSON.parse(row[4]) : null,
  }
}

test.describe('ALD-A3 — a real change becomes a readable audit row', () => {
  test('trigger → worker → audit_logs, with the diff the registry says it should carry', async () => {
    const since = dbNow()

    // ── Hop 1+2, the CREATE. The INSERT is itself the auditable act.
    seedProbeDepartment(DEPT, USERS.owner.id)
    await waitForAuditRow({ entityType: 'Departments', entityId: DEPT.id, action: 'CREATE', since })

    const created = auditRow(DEPT.id, 'CREATE', since)
    expect(created.entityType, 'the trigger stamps the PascalCase PLURAL').toBe('Departments')
    expect(created.performedBy, 'attributed to a real person, not "System"').toBe(USERS.owner.id)
    expect(created.oldValue, 'a CREATE has nothing to diff against').toBeNull()
    // Every tracked field, by name — not `toBeTruthy()` on the blob. A registry
    // whose trackFields drifted off the schema produces a NON-EMPTY snapshot
    // that is missing exactly the fields that matter, which is what F3 was.
    expect(Object.keys(created.newValue).sort()).toEqual(
      ['code', 'deletedAt', 'description', 'id', 'name', 'siteId', 'supervisorUserId'].sort(),
    )
    expect(created.newValue.name).toBe(DEPT.name)
    expect(created.newValue.code).toBe(DEPT.code)

    // ── The negative control, run FIRST so the positive one below acts as its
    // barrier: touching only an IGNORED column must record nothing at all.
    // Without this, "the trail recorded something" is satisfied by a trigger
    // that logs every heartbeat, and the diff would be noise rather than
    // evidence.
    //
    // The window opens HERE rather than at `since`, and that is not tidiness:
    // `seedProbeDepartment` deletes before it inserts, so on every run after the
    // first there is also a DELETE row inside `since`. Counting from `since`
    // makes the expected number depend on whether this file has run before,
    // which is not a property a test may have.
    const window = dbNow()
    sql(
      `SELECT set_config('app.current_user_id', '${USERS.owner.id}', false);
       UPDATE departments SET updated_at = NOW() WHERE id = '${DEPT.id}';`,
    )

    // ── Hop 1+2, the UPDATE. `description` is in departmentSites.js's
    // trackFields, so this one must land.
    const marker = dbNow()
    const tag = `ALD-A3 tracked ${Date.now()}`
    touchProbeDepartment(DEPT, { actorId: USERS.owner.id, description: tag })
    await waitForAuditRow({
      entityType: 'Departments',
      entityId: DEPT.id,
      action: 'UPDATE',
      since: marker,
    })

    const updated = auditRow(DEPT.id, 'UPDATE', marker)
    expect(Object.keys(updated.newValue), 'the diff names the changed field and nothing else').toEqual(
      ['description'],
    )
    expect(updated.newValue.description).toBe(tag)
    expect(updated.oldValue.description, 'and carries the value it replaced').not.toBe(tag)

    // The barrier pays off here. `graphile_worker` may run jobs concurrently, so
    // the untracked job is not guaranteed to be processed before the tracked
    // one; a short settle after the tracked row lands is what makes "it wrote
    // nothing" a measurement rather than a race.
    await new Promise((resolve) => setTimeout(resolve, 5_000))
    expect(
      trailRowsInTable(`entity_id = '${DEPT.id}' AND created_at > '${window}'`),
      'one row in the window, not two — the updated_at-only write left nothing behind',
    ).toBe(1)
  })

  test('the row reaches the page, names its subject, and opens to the diff', async ({ browser }) => {
    test.setTimeout(TRAIL_SYNC_TIMEOUT + 90_000)

    // Written immediately before the page opens, so it is at the top of the
    // CREATED_AT_DESC bootstrap and inside the page's own `.limit(200)` window.
    const marker = dbNow()
    const tag = `ALD-A3 visible ${Date.now()}`
    seedProbeDepartment(DEPT, USERS.owner.id)
    touchProbeDepartment(DEPT, { actorId: USERS.owner.id, description: tag })
    await waitForAuditRow({
      entityType: 'Departments',
      entityId: DEPT.id,
      action: 'UPDATE',
      since: marker,
    })

    const ctx = await browser.newContext({ storageState: AUTH.auditor })
    try {
      const page = await ctx.newPage()
      await gotoAuditLogs(page)

      // Hop 4 — the subject has to RESOLVE out of IndexedDB or the row is not
      // in the DOM at all. This is the reason the probe subject is a department
      // with a NULL `site_id`: `departments_sel` releases it to every member of
      // the tenant, so a missing row here means the audit permission denied it
      // and cannot mean "she could not see the department".
      const row = auditRows(page)
        .filter({ hasText: DEPT.name })
        .filter({ hasText: 'UPDATE' })
        .first()
      await expect(row, 'the change is on the trail page').toBeVisible({
        timeout: TRAIL_SYNC_TIMEOUT,
      })
      await expect(row, 'labelled with its subject, not a bare uuid').toContainText(DEPT.name)
      await expect(row, 'and typed').toContainText('Department')
      await expect(row, 'and attributed').toContainText(USERS.owner.name)

      // Expand. A row with a diff is the only kind that opens — the aria-label
      // flips from Expand to Collapse, which is why `auditRows` matches both.
      await row.click()
      await expect(
        page.getByText(tag, { exact: false }).first(),
        'the field-level diff is the payload, and it is the value we just wrote',
      ).toBeVisible({ timeout: 30_000 })
    } finally {
      await ctx.close()
    }
  })

  test('the subject is stamped as the PascalCase plural, and canonicalises to a module', () => {
    // The two halves of the mapping, side by side, because they are easy to
    // change independently and the failure is silent: a trigger stamp the
    // registry does not know resolves to itself (identity fallback) and answers
    // NULL for `moduleId`, which the client reads as "no module" rather than as
    // an error. That is precisely how 99.33% of this table once answered.
    const stamped = sqlValue(
      `SELECT entity_type FROM audit_logs WHERE entity_id = '${DEPT.id}' ORDER BY created_at DESC LIMIT 1`,
    )
    expect(stamped, 'the DB trigger writes the plural').toBe('Departments')

    expect(
      sqlValue(`SELECT public.audit_canonical_entity_type('${stamped}')`),
      'and the registry folds it to the singular canonical form',
    ).toBe('Department')

    expect(
      sqlValue(
        `SELECT module_id FROM audit_entity_types
          WHERE id = public.audit_canonical_entity_type('${stamped}')`,
      ),
      'which owns a real authz.modules id',
    ).toBe('departments')

    expect(
      sqlValue(`SELECT count(*) FROM authz.modules WHERE id = 'departments'`),
      'and that id is joinable — the property the old SCREAMING_SNAKE map never had',
    ).toBe('1')
  })
})
