// USER-J7 — 🔴 Authority changes leave no audit trail. WRITTEN TO FAIL.
//
// The audit pipeline is field-filtered, and the filter for `users` is
// (backend/worker/services/audit/registry/modules/userAccess.js):
//
//   users: { mode: 'fields',
//            trackFields: ['userStatusId', 'firstName', 'lastName', 'email'] }
//
// Four fields, all of them descriptive. Not one of them is an authority field.
// So changing what a person IS ALLOWED TO DO is invisible:
//
//   site_id   — the input every site-scoped grant is evaluated against.
//               Moving someone between sites silently re-points their access.
//   is_owner  — total tenant control; the first short-circuit in every RLS
//               policy in the schema.
//
// A rename is recorded. A promotion to company owner is not.
//
// ⚖️ For a QMS this is the finding with the longest tail. ISO 13485 §4.2.5 and
// 21 CFR Part 11 §11.10(e) both expect the record of WHO WAS AUTHORISED TO DO
// WHAT, and when it changed. "Who granted this person ownership, and when?" is
// a question an inspector asks and this system cannot answer from its own data.
// The escalation guard (USER-J1) now stops a member granting it to themselves,
// but a legitimate admin doing it through a trusted path is still unrecorded.
//
// The two 🔴 assertions FAIL TODAY. The control PASSES and is what makes the
// finding specific: a first_name change on the SAME ROW, through the SAME path,
// in the SAME test, does produce an audit row. So the trigger fires, the
// graphile job runs, the worker writes, and the pipeline is healthy — the
// silence is the trackFields list, not a broken mechanism.
import { test, expect } from '@playwright/test'
import { AUTH, USERS, SITES, COMPANY_ID } from '../fixtures/cast.js'
import { sql, sqlValue, waitForSqlValue } from '../fixtures/db.js'

const API = 'http://e2elab.localhost:4000'
const SUBJECT = USERS.auditor // a bystander: no journey mutates them

// entity_type is the PascalCase-pluralised model name ('Users'), NOT the SQL
// table name ('users'). Getting it wrong returns 0 for every query, which reads
// exactly like "not audited" — it made the CONTROL below fail while the
// pipeline was in fact working. Any audit assertion in this repo should check a
// known-good row exists before concluding silence.
function auditCountSince(stamp) {
  return `SELECT count(*) FROM audit_logs
          WHERE entity_type = 'Users' AND entity_id = '${SUBJECT.id}'
            AND created_at > '${stamp}'`
}

/** Server clock, so the window is not skewed by the test machine's clock. */
function dbNow() {
  return sqlValue(`SELECT now()::text`)
}

test.describe('USER-J7 · authority changes are not audited', () => {
  test.afterAll(() => {
    sql(`UPDATE users SET site_id = '${SITES.primary.id}', is_owner = false,
           first_name = '${SUBJECT.name.split(' ')[0]}' WHERE id = '${SUBJECT.id}'`)
  })

  test('CONTROL · a NAME change on this row IS audited (must pass today)', async ({ browser }) => {
    // Runs first, deliberately. It proves the whole pipeline — trigger →
    // graphile job → worker → audit_logs — is alive for this exact row before
    // the two probes below claim silence. Without it, "no audit row" could just
    // mean the worker was down.
    const stamp = dbNow()
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const res = await ctx.request.put(`${API}/v1/services/users/${SUBJECT.id}`, {
      data: { firstName: 'AuditProbe' },
    })
    expect(res.status(), 'the rename itself must succeed').toBeLessThan(300)
    await ctx.close()

    await waitForSqlValue(auditCountSince(stamp), {
      label: 'audit row for a tracked field (firstName)',
      timeoutMs: 30_000,
    })
  })

  test('🔴 moving a user between sites is audited (FAILS TODAY)', async ({ browser }) => {
    const stamp = dbNow()
    const ctx = await browser.newContext({ storageState: AUTH.owner })
    const res = await ctx.request.put(`${API}/v1/services/users/${SUBJECT.id}`, {
      data: { siteId: SITES.secondary.id },
    })
    expect(res.status(), 'the move itself must succeed').toBeLessThan(300)
    await ctx.close()

    // The move really happened — so a missing audit row is silence, not a
    // no-op update that the guard's IS DISTINCT FROM would have skipped.
    expect(sqlValue(`SELECT site_id FROM users WHERE id = '${SUBJECT.id}'`)).toBe(
      SITES.secondary.id,
    )

    await waitForSqlValue(auditCountSince(stamp), {
      label: 'audit row for a site_id change (site_id is not in trackFields)',
      timeoutMs: 20_000,
    })
  })

  test('🔴 granting company ownership is audited (FAILS TODAY)', async ({}) => {
    // is_owner has no REST or GraphQL writer at all — USER-J1's Tier A refuses
    // it for everyone including the owner. So the only way to set it is the
    // trusted DB path, which is exactly how it would be set in production
    // (a migration, a script, or a support action). app.current_user_id is set
    // in the same session because audit_trigger() reads it from the GUC and
    // audit_event skips any payload without one — otherwise this would fail
    // for a reason that has nothing to do with trackFields.
    const stamp = dbNow()
    sql(
      `SELECT set_config('app.current_user_id', '${USERS.owner.id}', false),
              set_config('app.current_company_id', '${COMPANY_ID}', false);
       UPDATE users SET is_owner = true WHERE id = '${SUBJECT.id}'`,
    )
    expect(sqlValue(`SELECT is_owner FROM users WHERE id = '${SUBJECT.id}'`)).toBe('t')

    await waitForSqlValue(auditCountSince(stamp), {
      label: 'audit row for an is_owner grant (is_owner is not in trackFields)',
      timeoutMs: 20_000,
    })
  })
})
