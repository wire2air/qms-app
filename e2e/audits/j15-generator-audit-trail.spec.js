// PW-J15 · The scheduled generator's writes ARE in the audit trail (URS-AUD-08).
//
// ─────────────────────────────────────────────────────────────────────────────
// READ THIS BEFORE CHANGING ANYTHING HERE
//
// automated-regression-coverage.md §10 records URS-AUD-08 as **Product
// non-conformant**: "Writes made by the scheduled generator are not recorded in
// the audit trail." OQ-07 TC-07-08 carries the matching known-limitation note,
// and PW-J1 carries a 🔴 expected-failure test (finding #4).
//
// **THAT NON-CONFORMANCE IS CLOSED.** This file was commissioned as a
// characterisation test to pin the defect; the defect no longer exists, so it
// is instead the CONFORMANCE test that retires it. Verified on app-db
// 2026-09-22 by running the real graphile task against a real programme:
//
//     audit_logs → AuditInstances | CREATE | e2e10000-…-000000000002
//
// TWO INDEPENDENT FIXES LANDED, and the requirement needs both:
//
//  1. **backend/worker/tasks/audit_event.js (G-03).** The task used to wrap its
//     INSERT in `if (payload.user_id)`. `audit_trigger()` fills that from
//     `current_setting('app.current_user_id')`, which no graphile-worker
//     connection ever sets — so a worker-driven write enqueued its audit job,
//     the job ran, and the job THREW THE ROW AWAY. That gate is deleted; a
//     payload with no user now writes `performed_by = NULL`, which is this
//     codebase's existing representation of a system actor (the column is
//     nullable, and `complaint_auto_close` already hand-wrote it).
//
//  2. **backend/worker/tasks/generate_due_audit_instances.js.** The mint is now
//     wrapped in `withSequelizeAuditContext` with the PROGRAMME'S `created_by`
//     as the actor. That is attribution, not forgery: the instance exists as a
//     direct, scheduled consequence of that person configuring the programme —
//     the same reasoning `workflow_delay_step_activate` uses for `submitted_by`.
//     The id was already being passed to `createInstanceFromProgram` as the
//     row's `createdBy`; it simply never reached the trigger.
//
// WHY BOTH ARMS BELOW, AND WHY NEITHER ALONE WOULD DO
//
// Fix 1 without fix 2 would produce a trail entry attributed to nobody — the
// row would exist, and TC-07-08 step 3 ("each entry carries performer and
// timestamp") would still fail. Fix 2 without fix 1 would set the GUC and the
// worker would discard the payload anyway. The two arms here are therefore
// *the row exists* and *the row names the programme's owner*, and a regression
// in either fix fails exactly one of them, which is what makes the failure
// readable.
//
// The third arm is the one that keeps the first two honest: an unattributed
// system write must still be RECORDED, not dropped. Without it, a future change
// that re-introduced the `if (payload.user_id)` gate would still pass arms 1
// and 2 (the generator sets the GUC) while silently re-breaking every other
// cron sweep in the product.
//
// MECHANICS WORTH KNOWING
//
//  - **Trigger-written audit rows are ASYNC.** `audit_trigger()` enqueues a
//    graphile job; the worker polls every 2s. Every read of `audit_logs` here
//    is behind a poll, never a bare read, so a slow pipeline cannot be
//    mis-reported as a missing entry.
//  - **`audit_logs` is append-only** (`audit_logs_immutable` +
//    `SELECT, INSERT` only for app_user). Nothing in this file deletes from it,
//    including the cleanup — the entries it produces are correct history.
//  - **Every test arranges its own programme.** Playwright discards the worker
//    after a failing test and runs its pending afterAll; a shared fixture would
//    take every later test down with the first failure.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, AUDIT_STANDARD, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { enqueueGenerator } from '../fixtures/audits.js'
import { sql, sqlRow, sqlValue, waitForSqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

/** Everything this file creates is greppable by this prefix. */
const TAG = 'PW-J15'

/**
 * A programme that is DUE the moment the generator next runs, with an auditor
 * pool so `pickNextLeadAuditor` has someone to pick (a pool-less programme
 * still mints, but the team assertion would be vacuous).
 *
 * `createdBy` is the whole point of this file: it is the actor the generator
 * attributes the mint to.
 */
function insertDueProgram({ name, createdBy = USERS.author.id }) {
  const creator = createdBy ? `'${createdBy}'` : 'NULL'
  const programId = sqlValue(`
    WITH ins AS (
      INSERT INTO audit_programs
        (company_id, name, program_type_id, audit_standard_id, frequency_id, days_interval,
         next_due_date, manager_user_id, active, created_by)
      VALUES
        ('${COMPANY_ID}', '${name}', 'INTERNAL', '${AUDIT_STANDARD.id}', 'EVERY_X_DAYS', 30,
         CURRENT_DATE - 1, '${USERS.author.id}', true, ${creator})
      RETURNING id
    ) SELECT id FROM ins`)
  sql(`
    INSERT INTO audit_program_auditors (company_id, audit_program_id, user_id, role_on_audit)
    VALUES ('${COMPANY_ID}', '${programId}', '${USERS.author.id}', 'LEAD')`)
  return programId
}

/** Remove one programme and everything the generator hung off it. Never audit_logs. */
function removeProgram(programId) {
  if (!programId) return
  const instanceIds = sql(`SELECT id FROM audit_instances WHERE audit_program_id = '${programId}'`)
    .split('\n')
    .filter(Boolean)
  for (const id of instanceIds) {
    sql(`DELETE FROM audit_requirement_responses WHERE audit_instance_id = '${id}'`)
    sql(`DELETE FROM audit_team_members WHERE audit_instance_id = '${id}'`)
    sql(`DELETE FROM audit_findings WHERE audit_instance_id = '${id}'`)
  }
  sql(`DELETE FROM audit_instances WHERE audit_program_id = '${programId}'`)
  sql(`DELETE FROM audit_program_auditors WHERE audit_program_id = '${programId}'`)
  sql(`DELETE FROM audit_programs WHERE id = '${programId}'`)
}

/** Sweep programmes an earlier run of this file left behind. */
function purge() {
  const ids = sql(
    `SELECT id FROM audit_programs WHERE company_id = '${COMPANY_ID}' AND name LIKE '${TAG}%'`,
  )
    .split('\n')
    .filter(Boolean)
  for (const id of ids) removeProgram(id)
}

/**
 * Run the generator and return the instance it minted for this programme.
 *
 * 120s: the worker polls every 2s, but the mint runs inside a per-programme
 * transaction that builds the requirement schema, and other suites share the
 * worker.
 */
async function mintViaGenerator(programId) {
  enqueueGenerator()
  return waitForSqlValue(
    `SELECT id FROM audit_instances WHERE audit_program_id = '${programId}' ORDER BY created_at DESC LIMIT 1`,
    { timeoutMs: 120_000, label: 'generator minted an instance' },
  )
}

test.beforeAll(purge)
test.afterAll(purge)

test.describe('PW-J15 · a scheduled audit is attributable', () => {
  test('a generator-minted audit instance is recorded in the audit trail', async () => {
    // TC-07-08 step 5 — "open the history of an instance the generator created
    // and record what is present." The answer used to be "nothing".
    test.setTimeout(240_000)

    const name = `${TAG} recorded ${Date.now()}`
    let programId = null
    try {
      programId = insertDueProgram({ name })
      const instanceId = await mintViaGenerator(programId)

      const rows = await waitForSqlValue(
        `SELECT count(*) FROM audit_logs
          WHERE entity_type = 'AuditInstances' AND entity_id = '${instanceId}'`,
        {
          timeoutMs: 90_000,
          label:
            'URS-AUD-08: a cron-generated audit must be recorded in audit_logs ' +
            '(fixed by audit_event.js G-03 — if this times out, the if(payload.user_id) gate is back)',
        },
      )
      expect(Number(rows), 'the automatic creation event is present in the trail').toBeGreaterThan(0)

      const entry = sqlRow(
        `SELECT action, coalesce(performed_by::text,''), coalesce(performed_at::text,''),
                company_id::text
           FROM audit_logs
          WHERE entity_type = 'AuditInstances' AND entity_id = '${instanceId}'
          ORDER BY performed_at LIMIT 1`,
      )
      expect(entry[0], 'the first entry is the creation itself').toBe('CREATE')
      expect(entry[2], 'TC-07-08 step 3 — every entry carries a timestamp').not.toBe('')
      expect(entry[3], 'and is filed against the owning tenant').toBe(COMPANY_ID)
    } finally {
      removeProgram(programId)
    }
  })

  test("the entry names the programme's owner, not nobody", async () => {
    // The half of URS-AUD-08 that fix 1 alone would not have delivered: a row
    // with `performed_by = NULL` satisfies "is recorded" and fails TC-07-08
    // step 3's "performer". `generate_due_audit_instances` resolves the actor
    // from `audit_programs.created_by` via `withSequelizeAuditContext`.
    test.setTimeout(240_000)

    const name = `${TAG} attributed ${Date.now()}`
    let programId = null
    try {
      // Aaron created the programme, so Aaron is who the scheduled mint is
      // attributed to — even though nobody was signed in when it ran.
      programId = insertDueProgram({ name, createdBy: USERS.author.id })
      const instanceId = await mintViaGenerator(programId)

      await waitForSqlValue(
        `SELECT count(*) FROM audit_logs
          WHERE entity_type = 'AuditInstances' AND entity_id = '${instanceId}'`,
        { timeoutMs: 90_000, label: 'generator CREATE reached the trail' },
      )

      // sqlValue returns '' for SQL NULL, never null — so an unattributed row
      // reads as the empty string here, and the message says which fix broke.
      expect(
        sqlValue(
          `SELECT coalesce(performed_by::text,'') FROM audit_logs
            WHERE entity_type = 'AuditInstances' AND entity_id = '${instanceId}'
              AND action = 'CREATE' ORDER BY performed_at LIMIT 1`,
        ),
        "the scheduled mint is attributed to the programme's creator — an empty value here " +
          'means generate_due_audit_instances lost its withSequelizeAuditContext wrapper',
      ).toBe(USERS.author.id)
    } finally {
      removeProgram(programId)
    }
  })

  test('an unattributable system write is still recorded, with a null performer', async () => {
    // The guard on the G-03 fix itself. Not every cron path HAS an actor —
    // `check_periodic_reviews`, `complaint_auto_close` and the rest have a
    // subject but nobody who clicked anything, and withAuditContext's own
    // header says naming the subject there would forge attribution. For those,
    // the contract is: the row lands, `performed_by` is NULL, and NULL means
    // "system" — not "unknown", and never "no entry".
    //
    // Probed with a raw superuser write (no GUCs set), which is exactly the
    // session shape a worker connection presents to `audit_trigger()`. Uses
    // `audit_instances` because it has a real registry module
    // (worker/services/audit/registry/modules/audits.js) that tracks `scope`,
    // so the UPDATE below is one the trail is configured to keep.
    test.setTimeout(180_000)

    const name = `${TAG} system ${Date.now()}`
    let programId = null
    try {
      programId = insertDueProgram({ name })
      const instanceId = await mintViaGenerator(programId)
      await waitForSqlValue(
        `SELECT count(*) FROM audit_logs WHERE entity_id = '${instanceId}'`,
        { timeoutMs: 90_000, label: 'generator CREATE reached the trail' },
      )

      sql(
        `UPDATE audit_instances SET scope = '${TAG} system write' WHERE id = '${instanceId}'`,
      )
      const unattributed = await waitForSqlValue(
        `SELECT count(*) FROM audit_logs
          WHERE entity_id = '${instanceId}' AND action = 'UPDATE' AND performed_by IS NULL`,
        {
          timeoutMs: 90_000,
          label:
            'a write with no acting user must still reach audit_logs with performed_by = NULL ' +
            '(if this times out, the if(payload.user_id) gate removed by G-03 is back)',
        },
      )
      expect(
        Number(unattributed),
        'no acting user is not the same as no record — the row lands, marked system',
      ).toBeGreaterThan(0)

      // And it really did record the change, not just the fact of one.
      const newValue = sqlValue(
        `SELECT new_value_json::text FROM audit_logs
          WHERE entity_id = '${instanceId}' AND action = 'UPDATE' AND performed_by IS NULL
          ORDER BY performed_at DESC LIMIT 1`,
      )
      // Postgres renders jsonb with a space after ':' and ',' — parse it rather
      // than matching the rendered text.
      expect(
        JSON.parse(newValue).scope,
        'TC-07-08 step 2 — the entry carries the new value of the changed field',
      ).toBe(`${TAG} system write`)
    } finally {
      removeProgram(programId)
    }
  })
})
