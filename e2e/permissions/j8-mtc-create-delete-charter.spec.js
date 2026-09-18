// MTC-10…17 — the charter's create and delete sections, EXECUTED.
//
// ═════════════════════════════════════════════════════════════════════════════
// WHAT THIS CLOSES
//
// `docs/modules/permissions/12-manual-qa-guide.md` sections B and C: eight
// cases covering "a role without `create` cannot create" and "a role without
// `delete` cannot delete", each at a named layer. They were written after the
// 2026-08-11 investigation and never run as a suite. Section B's own note says
// it plainly: *"This suite exists to keep that true, not to find it again."*
// Until this file, nothing kept it true.
//
// Four of the eight are the reason the section exists at all:
//
//   MTC-14  delete affordance absent without `:delete`      → PERM-J7 (UI)
//   MTC-15  soft delete refused for an `:update`-only holder → PERM-J2, here
//   MTC-16  hard delete refused for the same holder          → here
//   MTC-17  delete on the CAPA/NCR DETAIL page as creator    → PERM-J7 (UI)
//
// MTC-15 and MTC-17 are recorded in the charter as FAILING (F-27 and F-04).
// Both are now fixed, and both are verified here and in PERM-J2/J7 rather than
// taken on trust — see the addendum for the measurements.
//
// ═════════════════════════════════════════════════════════════════════════════
// MTC-13 IS NOT OPTIONAL. IT IS THE ONLY REASON MTC-11 MEANS ANYTHING.
//
// The charter is explicit: *"Control creates … succeeds with the same payload —
// **without this row MTC-11 proves nothing**."* A refused INSERT is
// indistinguishable from a malformed one, a missing column, a bad enum or a
// dropped table. So every refusal below is paired with a control persona
// issuing the SAME statement and succeeding.
import { test, expect } from '@playwright/test'
import { COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlAsAppUser, sqlValue } from '../fixtures/db.js'
import { attemptSoftDelete, holdsPermission } from '../fixtures/permissions.js'

const uid = (email) => sqlValue(`SELECT id FROM users WHERE email = '${email}'`)

let reviewer
let author

test.beforeAll(() => {
  reviewer = uid(USERS.reviewer.email)
  author = uid(USERS.author.email)
  expect(reviewer).toBeTruthy()
  expect(author).toBeTruthy()
})

/**
 * Clone a seeded row as a fresh record. See PERM-J2 for why this is a clone
 * rather than a field-by-field INSERT: `capas` has fourteen NOT NULL columns
 * without defaults and none of them is what these cases are about.
 */
function cloneRecord(table, numberColumn, suffix) {
  const title = `E2E MTC ${suffix} ${Date.now()}`
  const id = sqlValue(
    `INSERT INTO ${table}
     SELECT (t).* FROM (
       SELECT (jsonb_populate_record(NULL::${table},
         to_jsonb(src) || jsonb_build_object(
           'id', gen_random_uuid(),
           '${numberColumn}', 'E2E-MTC-' || substr(gen_random_uuid()::text, 1, 8),
           'title', '${title}', 'status_id', 'DRAFT', 'deleted_at', NULL))) AS t
         FROM ${table} src
        WHERE src.company_id = '${COMPANY_ID}' AND src.deleted_at IS NULL
        ORDER BY src.created_at DESC LIMIT 1) s
     RETURNING id`,
  )
  if (!id) throw new Error(`no seeded ${table} row to clone`)
  return id
}

test.describe('MTC-11/13 — create is refused at the policy, and the control proves it', () => {
  test('MTC-11 — a holder without `supplier_management:create` is refused by RLS', () => {
    // ⚠️ THE MODULE IS `supplier_management`, NOT `suppliers`. The TABLE is
    // `suppliers`; the catalog module that gates it is `supplier_management`
    // (`suppliers_ins` asks has_permission('supplier_management','create')).
    // `authz.module_actions` has NO rows at all for a module id `suppliers`, so
    // a grant written against that name is refused by the `rmp_module_action_fk`
    // foreign key — the catalog cannot express it. Getting this wrong makes the
    // probe below "fail" for a reason that has nothing to do with permissions.
    expect(
      holdsPermission(reviewer, 'supplier_management:create'),
      'premise: no supplier_management:create',
    ).toBe(false)

    // `code` is varchar(10) and `category` is NOT NULL — both easy to trip, and
    // tripping either produces an error that is NOT the policy, which the
    // assertion below would then wrongly accept as a refusal.
    const probeCode = `M11${String(Date.now()).slice(-6)}`
    const r = sqlAsAppUser(
      `INSERT INTO suppliers (id, company_id, name, code, category, created_at, updated_at)
       VALUES (gen_random_uuid(), '${COMPANY_ID}', 'E2E MTC-11 probe', '${probeCode}', 'GENERAL', now(), now());`,
      { userId: reviewer, companyId: COMPANY_ID },
    )

    expect(r.ok, 'the INSERT must be refused').toBe(false)
    expect(
      r.error,
      'refused BY THE POLICY — not by a NOT NULL violation or a bad enum, which would prove nothing',
    ).toMatch(/row-level security/i)
  })

  test('MTC-13 — the control issues the IDENTICAL statement and succeeds', () => {
    // Without this case, MTC-11 above passes when the table is missing a
    // column, when a trigger rejects the shape, or when `suppliers` does not
    // exist at all. This is the case that makes the refusal evidence.
    //
    // NO SEEDED PERSONA HOLDS `supplier_management:create` (measured 2026-09-17:
    // zero users in the tenant). Skipping would leave MTC-11 unpaired — i.e. leave
    // the charter's own "without this row MTC-11 proves nothing" unanswered —
    // so the grant is created here and revoked in the finally, exactly as the
    // delete controls do. The persona is returned to its seeded shape.
    const roleId = sqlValue(
      `SELECT r.id FROM roles r
        JOIN roles_on_users ru ON ru.role_id = r.id AND ru.deleted_at IS NULL
       WHERE ru.user_id = '${author}' AND r.company_id = '${COMPANY_ID}' AND r.deleted_at IS NULL
       ORDER BY r.name LIMIT 1`,
    )
    expect(roleId, 'the control persona reaches a role directly').toBeTruthy()

    const code = `M13${String(Date.now()).slice(-6)}`
    sql(
      `INSERT INTO authz.role_module_permissions (role_id, company_id, module_id, action_id, scope_id)
       VALUES ('${roleId}', '${COMPANY_ID}', 'supplier_management', 'create', 'tenant') ON CONFLICT DO NOTHING`,
    )
    try {
      expect(
        holdsPermission(author, 'supplier_management:create'),
        'the control grant landed',
      ).toBe(true)

      const r = sqlAsAppUser(
        `INSERT INTO suppliers (id, company_id, name, code, category, created_at, updated_at)
         VALUES (gen_random_uuid(), '${COMPANY_ID}', 'E2E MTC-13 control', '${code}', 'GENERAL', now(), now());`,
        { userId: author, companyId: COMPANY_ID },
      )

      expect(
        r.ok,
        `the payload MTC-11 was refused is accepted for a create holder — so the refusal was the policy: ${r.error}`,
      ).toBe(true)
    } finally {
      sql(`DELETE FROM suppliers WHERE code = '${code}'`)
      sql(
        `DELETE FROM authz.role_module_permissions
          WHERE role_id = '${roleId}' AND module_id = 'supplier_management' AND action_id = 'create'`,
      )
    }

    expect(
      holdsPermission(author, 'supplier_management:create'),
      'the grant was rolled back',
    ).toBe(false)
  })
})

test.describe('MTC-15/16 — the two delete paths, for the same update-only holder', () => {
  test('MTC-15 — the SOFT delete (what the SPA actually sends) is refused', () => {
    // Recorded in the charter as ❌ succeeds (F-27). Now fixed by the
    // `enforce_soft_delete_permission` trigger over 29 tables. This is the case
    // the charter calls the one that "invalidates other packs' delete
    // journeys": any delete driven through the SPA is an UPDATE.
    expect(holdsPermission(reviewer, 'capa:update')).toBe(true)
    expect(holdsPermission(reviewer, 'capa:delete')).toBe(false)

    const capa = cloneRecord('capas', 'capa_number', 'soft')
    const outcome = attemptSoftDelete('capas', capa, reviewer)

    expect(outcome.allowed, 'soft delete refused for an update-only holder').toBe(false)
    expect(outcome.stillLive, 'and the row survived').toBe(true)

    sql(`DELETE FROM capas WHERE id = '${capa}'`)
  })

  test('MTC-16 — the HARD delete is refused for the same holder', () => {
    // Recorded as ✅ passing, and worth keeping executed: it is the control
    // proving the `capas_delete_rls` policy exists and is simply never reached
    // from the browser. If this ever starts failing while MTC-15 still passes,
    // someone has dropped the DELETE policy believing the trigger replaced it —
    // which would open REST, where the policy IS the gate.
    const capa = cloneRecord('capas', 'capa_number', 'hard')

    const r = sqlAsAppUser(`DELETE FROM capas WHERE id = '${capa}';`, {
      userId: reviewer,
      companyId: COMPANY_ID,
    })

    // An RLS DELETE refusal is a zero-row success, not an error: the policy
    // simply matches nothing. So the assertion is on the ROW, not on `ok`.
    const survived = sqlValue(`SELECT count(*) FROM capas WHERE id = '${capa}'`)
    expect(
      survived,
      'the row survives a hard delete by a holder without capa:delete',
    ).toBe('1')
    expect(r.ok, 'the statement itself does not error — RLS filters, it does not raise').toBe(true)

    sql(`DELETE FROM capas WHERE id = '${capa}'`)
  })

  test('MTC-15/16 control — a delete holder succeeds on both paths', () => {
    // The paired control for both cases above, for the same reason MTC-13
    // exists. Granted temporarily and revoked in a finally, so the persona is
    // returned to the shape every other suite expects.
    const roleId = sqlValue(
      `SELECT r.id FROM roles r
        JOIN roles_on_users ru ON ru.role_id = r.id AND ru.deleted_at IS NULL
       WHERE ru.user_id = '${reviewer}' AND r.company_id = '${COMPANY_ID}' AND r.deleted_at IS NULL
       ORDER BY r.name LIMIT 1`,
    )
    const soft = cloneRecord('capas', 'capa_number', 'ctl-soft')
    const hard = cloneRecord('capas', 'capa_number', 'ctl-hard')

    sql(
      `INSERT INTO authz.role_module_permissions (role_id, company_id, module_id, action_id, scope_id)
       VALUES ('${roleId}', '${COMPANY_ID}', 'capa', 'delete', 'tenant') ON CONFLICT DO NOTHING`,
    )
    try {
      expect(holdsPermission(reviewer, 'capa:delete'), 'the grant landed').toBe(true)

      const softOutcome = attemptSoftDelete('capas', soft, reviewer)
      expect(softOutcome.allowed, `soft delete allowed with the grant: ${softOutcome.error}`).toBe(
        true,
      )

      sqlAsAppUser(`DELETE FROM capas WHERE id = '${hard}';`, {
        userId: reviewer,
        companyId: COMPANY_ID,
      })
      expect(
        sqlValue(`SELECT count(*) FROM capas WHERE id = '${hard}'`),
        'hard delete removes the row with the grant',
      ).toBe('0')
    } finally {
      sql(
        `DELETE FROM authz.role_module_permissions
          WHERE role_id = '${roleId}' AND module_id = 'capa' AND action_id = 'delete'`,
      )
      sql(`DELETE FROM capas WHERE id IN ('${soft}', '${hard}')`)
    }

    expect(holdsPermission(reviewer, 'capa:delete'), 'grant rolled back').toBe(false)
  })
})

test.describe('MTC-23/24 — the quality-event status path (both charter rows are now stale)', () => {
  test('MTC-23 (CORRECTED) — a terminal status can no longer be set by an `:update` holder', () => {
    // ═══════════════════════════════════════════════════════════════════════
    // The charter records MTC-23 as ❌ **succeeds** and calls it F-05: a
    // `quality_events:update` holder could drive an event to CANCELLED through
    // the detail-page dropdown, with no `:close` grant, no e-signature and no
    // CLOSE audit row — and no way back, because the guard blocks every exit
    // from a terminal state. "The guard closes the exit and leaves the entrance
    // open."
    //
    // BOTH HALVES ARE NOW FIXED, and neither was recorded:
    //
    //   · the trigger — the live `enforce_quality_event_status_transition` now
    //     tests `NOT v_trusted AND NEW.status_id = ANY(v_terminal)`, where
    //     v_terminal is ARRAY['CLOSED','CANCELLED']. It used to test v_gated,
    //     which listed only ESCALATED and CLOSED. CANCELLED is now blocked on
    //     the untrusted path exactly like CLOSED.
    //   · the dropdown — `QualityEventsPageId.vue` renders a read-only status
    //     BADGE. statusId is excluded from the update mutation entirely, and
    //     the three REST endpoints are the only writers.
    //
    // So the case is inverted here: the write must be REFUSED.
    // ═══════════════════════════════════════════════════════════════════════
    const qe = sqlValue(
      `SELECT id FROM quality_events
        WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL AND status_id NOT IN ('CLOSED','CANCELLED')
        ORDER BY created_at DESC LIMIT 1`,
    )
    test.skip(!qe, 'no open quality event seeded')

    const before = sqlValue(`SELECT status_id FROM quality_events WHERE id = '${qe}'`)

    const r = sqlAsAppUser(
      `UPDATE quality_events SET status_id = 'CANCELLED' WHERE id = '${qe}';`,
      { userId: reviewer, companyId: COMPANY_ID },
    )

    // ⚠️ ASSERT THE ROW, NOT THE STATEMENT. An RLS-filtered UPDATE SUCCEEDS —
    // it reports `UPDATE 0` and exits 0, because the policy removed the row
    // from the statement's view before the SET was applied. The guard trigger
    // never fires, so there is no error to catch. `expect(r.ok).toBe(false)`
    // is the wrong assertion here and it fails against a system that is
    // behaving correctly; the persona holds no `quality_events` grant at all
    // (measured: zero quality_events permissions), so this write is stopped one
    // layer EARLIER than the status guard.
    //
    // The security property is "the status did not change", and that is what is
    // asserted. MTC-24 below covers the guard itself.
    const after = sqlValue(`SELECT status_id FROM quality_events WHERE id = '${qe}'`)
    expect(
      after,
      'the event must NOT have been cancelled on the untrusted path (F-05, both halves fixed)',
    ).toBe(before)
    expect(
      r.output.trim().split('\n').pop(),
      'refused by RLS filtering the row out — UPDATE 0, not an exception',
    ).toBe('UPDATE 0')
  })

  test('MTC-24 — CLOSED via the same path raises QMSQE, the control that proves the guard runs', () => {
    // The control for MTC-23. If the guard were inert (which has happened
    // before in this codebase — a SECURITY DEFINER attribute lost to a
    // CREATE OR REPLACE left the QE guard silently dead for eight days), this
    // case would pass the UPDATE and MTC-23 above would be meaningless.
    const qe = sqlValue(
      `SELECT id FROM quality_events
        WHERE company_id = '${COMPANY_ID}' AND deleted_at IS NULL AND status_id NOT IN ('CLOSED','CANCELLED')
        ORDER BY created_at DESC LIMIT 1`,
    )
    test.skip(!qe, 'no open quality event seeded')

    // THE PERSONA HAS TO BE ABLE TO SEE THE ROW, or this case proves nothing.
    // Measured 2026-09-17: exactly ONE seeded user holds any `quality_events`
    // grant (deptadmin, read-only), so no existing persona can reach the guard
    // — an RLS-filtered UPDATE returns `UPDATE 0` and the trigger never fires.
    // That is what MTC-23 above asserts. To exercise the GUARD itself the
    // persona needs read+update, granted here and revoked in the finally.
    const roleId = sqlValue(
      `SELECT r.id FROM roles r
        JOIN roles_on_users ru ON ru.role_id = r.id AND ru.deleted_at IS NULL
       WHERE ru.user_id = '${reviewer}' AND r.company_id = '${COMPANY_ID}' AND r.deleted_at IS NULL
       ORDER BY r.name LIMIT 1`,
    )
    const addGrant = (action) =>
      sql(
        `INSERT INTO authz.role_module_permissions (role_id, company_id, module_id, action_id, scope_id)
         VALUES ('${roleId}', '${COMPANY_ID}', 'quality_events', '${action}', 'tenant') ON CONFLICT DO NOTHING`,
      )

    const before = sqlValue(`SELECT status_id FROM quality_events WHERE id = '${qe}'`)
    addGrant('read')
    addGrant('update')
    try {
      const r = sqlAsAppUser(`UPDATE quality_events SET status_id = 'CLOSED' WHERE id = '${qe}';`, {
        userId: reviewer,
        companyId: COMPANY_ID,
      })

      expect(r.ok, 'CLOSED is refused on the untrusted path even WITH read+update').toBe(false)
      expect(r.error, 'and refused by the QE guard specifically').toMatch(/QMSQE|quality event/i)
      expect(sqlValue(`SELECT status_id FROM quality_events WHERE id = '${qe}'`)).toBe(before)
    } finally {
      sql(
        `DELETE FROM authz.role_module_permissions
          WHERE role_id = '${roleId}' AND module_id = 'quality_events' AND action_id IN ('read','update')`,
      )
    }
  })
})
