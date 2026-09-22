// EQ-J7 — the status lifecycle, and the audit trail that is the only record of it.
//
// WHY THIS FILE EXISTS. Two of the module's six URS rows had no evidence worth
// the name, and they are the same story told from two ends:
//
//   URS-EQP-04 (status control) was scored Partial off EQ-J1's edit journey,
//     which flips a status through the dialog and checks the column moved. That
//     asserts that a write works. It says nothing about the RULE — which
//     transitions are legal — and nothing about whether the change left a
//     record. Those are the two things TC-11-04 actually asks for.
//   URS-EQP-06 (audit trail) was scored "Not automated" outright. No test in
//     either repository had ever looked at an Equipment audit row.
//
// They belong in one file because on this module they are the SAME control. The
// register has **no reason field** for a status change — verified below against
// `UPDATABLE_FIELDS` and against the live column list — and **notes and
// description are deliberately untracked**, so a note typed alongside the change
// produces no audit row at all. Subtract both and what is left is: the audit
// trail is the ONLY system record that an instrument was taken out of service.
// If the trail is silent, the control does not exist.
//
// ── THE FOUR LAYERS, AND WHY EACH IS PROBED SEPARATELY ──────────────────────
//
//   1. THE TRIGGER. `equipment_status_transition_guard_trg` (BEFORE UPDATE,
//      WHEN status_id IS DISTINCT FROM) enforces the state machine. Note what
//      it does NOT have: any `IF current_user <> 'app_user'` self-skip. Unlike
//      `enforce_soft_delete_permission_trg` — which does self-skip, and whose
//      skip is the whole subject of EQ-J3 — this guard binds the REST superuser
//      connection exactly as hard as it binds `app_user`. Both paths are probed
//      because a future "let the service handle it" refactor would only show up
//      on one of them.
//
//   2. THE REINSTATEMENT STAMP. The same trigger NULLs `retired_at` on the way
//      out of RETIRED. EQ-J1 asserts the stamp going IN (through the dialog's
//      re-implementation in `buildModelFields()`); nothing asserted it coming
//      back out, and the two halves live in different codebases.
//
//   3. THE TRAIL'S CONTENT. `equipment` carries `equipment_audit_trigger`
//      (AFTER INSERT/UPDATE/DELETE → `audit_trigger()`), which only ENQUEUES a
//      graphile-worker job; `backend/worker/tasks/audit_event.js` writes the
//      row. So every assertion here is behind that hop and has to poll. The
//      registry module (`worker/services/audit/registry/modules/equipment.js`)
//      maps statusId onto SEMANTIC actions — ACTIVATE / DEACTIVATE / RETIRE —
//      rather than a flat UPDATE, which is the thing an inspector reads.
//
//   4. THE READ SURFACE. `audit_log_select_rls` admits a row on owner-bypass,
//      OR `audit_trail:read`, OR the subject module's own `read` action via
//      `audit_entity_types`. `Equipment` maps to `calibration_equipment`, and
//      that module HAS NO `read` ACTION (migration 20260810170000 dropped it,
//      live-verified in authz.module_actions). So the third arm can never fire
//      for equipment: the register is readable by the whole tenant while its
//      history is readable by almost nobody — including the persona who owns
//      the register and personally made every change. That asymmetry is the
//      single most surprising fact about this module and it had no test.
//
// AUDIT ROWS ARE NEVER CLEANED UP. `audit_logs` carries `audit_logs_immutable`,
// which RAISEs on any UPDATE or DELETE — that trigger is the tamper control
// TC-11-06 step 4 exists to check, and a fixture that worked around it would be
// dismantling the property under test. Every count in this file is therefore
// scoped to a `created_at >` window taken from the server clock.
import { test, expect } from '@playwright/test'
import { AUTH, COMPANY_ID, EQUIPMENT, SITES, USERS } from '../fixtures/cast.js'
import { sql, sqlAsAppUser, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import {
  createPersonaPool,
  findEquipment,
  findEquipmentByCode,
  openRegister,
  purgeEquipmentByCode,
  registerRow,
  restPatch,
  restPost,
} from '../fixtures/equipment.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

// Constant codes purged in beforeAll — EQ-J1's reasoning. A timestamped code
// would change when Playwright restarts the worker after a failure and
// re-evaluates module scope.
const LIFECYCLE = { code: 'E2E-EQ-J7-LIFECYCLE', name: 'E2E J7 Analytical Balance (lifecycle)' }
const RETIRED_BORN = { code: 'E2E-EQ-J7-RETIRED', name: 'E2E J7 Sieve Shaker (born retired)' }
const TRAIL = { code: 'E2E-EQ-J7-TRAIL', name: 'E2E J7 Conductivity Meter (trail)' }
const QUIET = { code: 'E2E-EQ-J7-QUIET', name: 'E2E J7 Stopwatch (untracked fields)' }
const ALL = [LIFECYCLE, RETIRED_BORN, TRAIL, QUIET]

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

/** Server clock — a window taken from the test machine's clock can skew. */
function dbNow() {
  return sqlValue('SELECT now()::text')
}

/**
 * Seed an instrument BORN in a given status, by DELETE + INSERT.
 *
 * Not an upsert, and not a REST create followed by a PATCH. `ON CONFLICT DO
 * UPDATE` is still an UPDATE and therefore still fires
 * `equipment_status_transition_guard_trg`, so an "arrange" step that tried to
 * put a row INTO `RETIRED` that way would be refused by the very guard the test
 * is about to probe — and the failure would read as though the product had
 * broken. An INSERT never fires the guard (its WHEN clause is UPDATE-only), so
 * a row born RETIRED is the only honest way to set up the RETIRED → IN_SERVICE
 * probe.
 */
function seedEquipment({ code, name, statusId = 'IN_SERVICE', retiredAt = false }) {
  purgeEquipmentByCode(code)
  sql(
    `INSERT INTO equipment (id, company_id, code, name, category, site_id, department_id,
        status_id, retired_at, created_at, updated_at)
     VALUES (gen_random_uuid(), ${q(COMPANY_ID)}, ${q(code)}, ${q(name)}, 'INSTRUMENT',
        ${q(SITES.primary.id)}, NULL, ${q(statusId)},
        ${retiredAt ? 'NOW()' : 'NULL'}, NOW(), NOW())`,
  )
  const row = findEquipmentByCode(code)
  expect(row, `seeded ${code} is in Postgres`).not.toBeNull()
  expect(row.statusId, `${code} was BORN ${statusId}, not moved into it`).toBe(statusId)
  return row
}

/** Audit rows for one instrument inside a window, newest first. */
function trailFor(equipmentId, since) {
  // ONE JSON DOCUMENT PER ROW, not psql's pipe-separated columns.
  //
  // `db.js` runs psql `-tA`, which separates columns with `|` — and the two
  // payloads here are jsonb holding user-supplied text (an instrument named
  // "Balance | Lab 2" is perfectly legal). A `split('|')` parse would shred
  // exactly the rows this file cares about, and would do it silently: the
  // fragments still JSON.parse into *something* often enough that the failure
  // would read as a wrong diff rather than a broken parser. Wrapping each row
  // in `json_build_object` moves the escaping into Postgres, where it is the
  // server's problem and is already correct.
  //
  // `performed_by` is coalesced to '' rather than left NULL because `sqlValue`
  // hands SQL NULL back as '' anyway; keeping the two shapes identical means
  // callers never have to distinguish them.
  const out = sql(
    `SELECT json_build_object(
              'action', action,
              'old', old_value_json,
              'new', new_value_json,
              'performedBy', coalesce(performed_by::text, '')
            )::text
       FROM audit_logs
      WHERE entity_type = 'Equipment' AND entity_id = ${q(equipmentId)}
        AND created_at > ${q(since)}
      ORDER BY created_at DESC`,
  )
  if (!out) return []
  // Postgres renders jsonb WITH a space after the colon — parse it, never
  // string-match it. One document per line is safe here because json_build_object
  // escapes any newline inside a value as \n rather than emitting it raw.
  return out.split('\n').map((line) => {
    const row = JSON.parse(line)
    return { ...row, performedBy: row.performedBy || null }
  })
}

/** Wait for the worker to land an audit row with this action. */
async function waitForTrailAction(equipmentId, action, since) {
  return waitForSqlValue(
    `SELECT id FROM audit_logs
      WHERE entity_type = 'Equipment' AND entity_id = ${q(equipmentId)}
        AND action = ${q(action)} AND created_at > ${q(since)}
      ORDER BY created_at DESC LIMIT 1`,
    { timeoutMs: 90_000, label: `Equipment/${action} audit row` },
  )
}

/**
 * How many Equipment audit rows `audit_log_select_rls` shows this persona.
 *
 * `sqlAsAppUser` is the only way to read the policy's verdict: REST/Sequelize
 * connects as the superuser and bypasses RLS entirely, so a REST probe would
 * answer a different question. The `RESULT=` marker exists because the helper's
 * own session setup prints several lines — parsing by position would be a
 * hostage to how many.
 */
function trailRowsVisibleTo(userId, equipmentId) {
  const res = sqlAsAppUser(
    `SELECT 'RESULT=' || count(*)::text FROM audit_logs
      WHERE entity_type = 'Equipment' AND entity_id = ${q(equipmentId)};`,
    { userId, companyId: COMPANY_ID },
  )
  expect(res.ok, `the RLS probe ran (stderr: ${res.error})`).toBeTruthy()
  const m = /RESULT=(\d+)/.exec(res.output)
  expect(m, `the RLS probe returned a count (output: ${res.output})`).not.toBeNull()
  return Number(m[1])
}

test.describe('EQ-J7 · the status lifecycle and its trail', () => {
  test.beforeAll(() => {
    for (const e of ALL) purgeEquipmentByCode(e.code)
  })
  test.afterAll(() => {
    // Equipment rows only. The audit rows they produced stay where they are —
    // `audit_logs_immutable` RAISEs on DELETE, and reaching around it would be
    // dismantling TC-11-06 step 4.
    for (const e of ALL) purgeEquipmentByCode(e.code)
  })

  // ── 1 · The state machine, at the database ────────────────────────────────

  test('the database refuses RETIRED → IN_SERVICE, on the superuser path as hard as on app_user', async ({
    browser,
  }) => {
    // TC-11-04 step 4 / URS-EQP-04. The permitted edges are
    //   IN_SERVICE     → OUT_OF_SERVICE | RETIRED
    //   OUT_OF_SERVICE → IN_SERVICE     | RETIRED
    //   RETIRED        → OUT_OF_SERVICE
    // and the one that is NOT permitted is the reinstatement shortcut, because a
    // retired instrument has to have its calibration re-established before it
    // can take a measurement again.
    //
    // ARRANGED IN THIS TEST, not inherited: Playwright discards the worker after
    // a failure and runs the file's pending afterAll, so a row seeded once at
    // the top of the file is gone by the time a later test looks for it.
    const subject = seedEquipment({ ...RETIRED_BORN, statusId: 'RETIRED', retiredAt: true })

    // (a) The superuser connection — the one REST uses. `enforce_soft_delete_
    //     permission_trg` self-skips here by design (EQ-J3's whole subject);
    //     this guard has no such arm, and that difference is worth pinning.
    const bySuperuser = (() => {
      try {
        sql(`UPDATE equipment SET status_id = 'IN_SERVICE' WHERE id = ${q(subject.id)}`)
        return { ok: true, error: '' }
      } catch (err) {
        return { ok: false, error: `${err.stderr ?? err.message ?? err}` }
      }
    })()
    expect(
      bySuperuser.ok,
      'the guard is NOT a permission check with a superuser bypass — it is a state machine, and it binds every connection',
    ).toBe(false)
    expect(bySuperuser.error).toMatch(/status cannot move from RETIRED to IN_SERVICE/i)

    // (b) `app_user` — the role PostGraphile runs the syncEngine's edit as.
    const byAppUser = sqlAsAppUser(
      `UPDATE equipment SET status_id = 'IN_SERVICE' WHERE id = ${q(subject.id)};`,
      { userId: EQUIPMENT.admin.user.id, companyId: COMPANY_ID },
    )
    expect(byAppUser.ok, 'the syncEngine path is refused too').toBe(false)
    expect(byAppUser.error).toMatch(/status cannot move from RETIRED to IN_SERVICE/i)

    // (c) And over REST, which is the answer a user would actually see. The
    //     service does not pre-check the edge — it hands the UPDATE to
    //     Postgres, so this is the trigger's message surfacing through the API.
    const page = await pool.page(browser, EQUIPMENT.admin.auth)
    const res = await restPatch(page, `/equipment/${subject.id}`, { statusId: 'IN_SERVICE' })
    expect(
      res.status(),
      `REST accepted a forbidden transition: ${await res.text()}`,
    ).toBeGreaterThanOrEqual(400)

    expect(
      findEquipment(subject.id).statusId,
      'three refusals and the instrument is still retired',
    ).toBe('RETIRED')
  })

  test('reinstatement goes the long way round, and clears the retirement stamp', async () => {
    // The permitted path out of RETIRED, and the half of the retiredAt pair
    // nothing covered. EQ-J1 asserts the stamp going IN through the dialog's
    // `buildModelFields()`; the stamp coming OUT is written by the TRIGGER, in
    // a different repository, and the two had never been asserted together.
    const subject = seedEquipment({ ...RETIRED_BORN, statusId: 'RETIRED', retiredAt: true })
    expect(
      findEquipment(subject.id).statusId,
      'the arrange step really produced a retired instrument',
    ).toBe('RETIRED')
    expect(
      sqlValue(`SELECT retired_at FROM equipment WHERE id = ${q(subject.id)}`),
      '…carrying a retirement stamp',
    ).toBeTruthy()

    // Hop 1 — RETIRED → OUT_OF_SERVICE. Permitted, and the trigger NULLs the
    // stamp on the way through because the instrument is no longer retired.
    const outOfService = sqlAsAppUser(
      `UPDATE equipment SET status_id = 'OUT_OF_SERVICE' WHERE id = ${q(subject.id)};`,
      { userId: EQUIPMENT.admin.user.id, companyId: COMPANY_ID },
    )
    expect(outOfService.ok, `reinstatement to OUT_OF_SERVICE was refused: ${outOfService.error}`).toBe(
      true,
    )
    expect(findEquipment(subject.id).statusId).toBe('OUT_OF_SERVICE')
    // ⚠ `retired_at IS NULL` as a BOOLEAN, not `SELECT retired_at` compared to
    // ''. `sqlValue` hands SQL NULL back as '' only when the row has another
    // column beside it — a query selecting ONE column that is NULL produces a
    // single blank line, `sql()` trims it away, and `sqlRow` cannot tell that
    // from no rows at all, so it returns JS `null`. Both "the stamp is cleared"
    // and "the instrument does not exist" would then read identically. Asking
    // Postgres the question directly removes the ambiguity.
    expect(
      sqlValue(`SELECT retired_at IS NULL FROM equipment WHERE id = ${q(subject.id)}`),
      'leaving RETIRED clears the stamp — otherwise the register would show a live ' +
        'instrument with a retirement date on it',
    ).toBe('t')

    // Hop 2 — OUT_OF_SERVICE → IN_SERVICE. Now permitted, where it was not one
    // hop ago. That is the whole point of the two-step: it forces a deliberate
    // stop at "out of service", which is where calibration is re-established.
    const backInService = sqlAsAppUser(
      `UPDATE equipment SET status_id = 'IN_SERVICE' WHERE id = ${q(subject.id)};`,
      { userId: EQUIPMENT.admin.user.id, companyId: COMPANY_ID },
    )
    expect(backInService.ok, `return to service was refused: ${backInService.error}`).toBe(true)
    expect(findEquipment(subject.id).statusId).toBe('IN_SERVICE')
  })

  test('there is no reason field for a status change, anywhere in the write path', async ({
    browser,
  }) => {
    // TC-11-04 step 2, pinned as an OBSERVATION rather than a defect. The
    // protocol's instruction to the executor is to record the procedural control
    // by which the reason is documented, because the system has no field for it.
    // That is only a safe instruction while it remains TRUE — the day someone
    // adds a `status_reason` column, this test fails and the protocol's note
    // needs rewriting rather than quietly becoming wrong.
    const columns = sql(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'equipment' AND column_name ~* 'reason|justification|rationale'`,
    )
    expect(
      columns,
      'no reason/justification column exists on `equipment` — if one now does, ' +
        'content/validation/oq/equipment-calibration.md TC-11-04 step 2 is stale',
    ).toBe('')

    // And the API refuses to carry one: `reason` is not in the service's
    // UPDATABLE_FIELDS, so it is dropped rather than stored somewhere unexpected.
    const subject = seedEquipment({ ...LIFECYCLE })
    const page = await pool.page(browser, EQUIPMENT.admin.auth)
    const res = await restPatch(page, `/equipment/${subject.id}`, {
      statusId: 'OUT_OF_SERVICE',
      reason: 'Failed verification against the reference weight',
      statusReason: 'Failed verification against the reference weight',
    })
    expect(res.status(), `the status change itself must succeed: ${await res.text()}`).toBe(200)
    expect(findEquipment(subject.id).statusId).toBe('OUT_OF_SERVICE')

    const stored = await res.json()
    expect(
      Object.keys(stored?.equipment ?? {}).filter((k) => /reason/i.test(k)),
      'the reason was silently dropped, not stored — there is nowhere for it to go',
    ).toEqual([])
  })

  // ── 2 · What the trail records ────────────────────────────────────────────

  test('every status change is recorded as a semantic action with both values', async () => {
    // TC-11-04 step 5 and TC-11-06 steps 1–3 in one walk. `registry/modules/
    // equipment.js` maps statusId through an actionMap, so the trail reads
    // RETIRE / DEACTIVATE / ACTIVATE rather than three indistinguishable
    // UPDATEs — which is the difference between a trail an inspector can read
    // and a trail they have to expand row by row.
    const since = dbNow()
    const subject = seedEquipment({ ...TRAIL })

    // Drive the three edges through `app_user` with the GUCs set, which is what
    // the register's own dialog does (useLiveMutation → GraphQL → equipment_upd).
    for (const next of ['OUT_OF_SERVICE', 'RETIRED']) {
      const res = sqlAsAppUser(
        `UPDATE equipment SET status_id = ${q(next)} WHERE id = ${q(subject.id)};`,
        { userId: EQUIPMENT.admin.user.id, companyId: COMPANY_ID },
      )
      expect(res.ok, `the ${next} transition was refused: ${res.error}`).toBe(true)
    }

    // ⚠ POLL. `equipment_audit_trigger` only calls
    // `graphile_worker.add_job('audit_event')`; the WORKER writes audit_logs. A
    // single-shot query here races that hop and reads as "not audited".
    await waitForTrailAction(subject.id, 'RETIRE', since)
    await waitForTrailAction(subject.id, 'DEACTIVATE', since)

    const rows = trailFor(subject.id, since)
    const actions = rows.map((r) => r.action)
    expect(
      actions,
      'the register INSERT is itself auditable — an instrument appearing from nowhere is a finding',
    ).toContain('CREATE')
    expect(actions, 'in-service → out-of-service reads as DEACTIVATE').toContain('DEACTIVATE')
    expect(actions, 'out-of-service → retired reads as RETIRE').toContain('RETIRE')

    // TC-11-06 step 2 — old AND new, not just the landing value. A trail that
    // recorded only where a record ended up could not answer "what was it
    // before", which is the question an investigation actually asks.
    const retire = rows.find((r) => r.action === 'RETIRE')
    expect(retire.old.statusId, 'the trail carries where it came FROM').toBe('OUT_OF_SERVICE')
    expect(retire.new.statusId, 'and where it went TO').toBe('RETIRED')

    const deactivate = rows.find((r) => r.action === 'DEACTIVATE')
    expect(deactivate.old.statusId).toBe('IN_SERVICE')
    expect(deactivate.new.statusId).toBe('OUT_OF_SERVICE')

    // TC-11-06 step 3 — the performer. Attribution comes from
    // `app.current_user_id`, which `sqlAsAppUser` sets exactly as
    // `authzPgSettings.js` does on a real request, so these rows carry a real
    // actor. The CREATE row does NOT, and must not be asserted to: it came from
    // a bare `sql()` seed with no GUC, which is the same shape as a nightly
    // cron's write — a SYSTEM event, legitimately unattributed.
    expect(retire.performedBy, 'a user-driven transition names the user').toBe(
      EQUIPMENT.admin.user.id,
    )
    expect(deactivate.performedBy).toBe(EQUIPMENT.admin.user.id)
  })

  test('a notes-only or description-only edit produces no audit entry at all', async () => {
    // The deliberate exclusion, and the trap it sets for an executor. `notes`
    // and `description` are NOT in the registry's trackFields, so
    // `hasRelevantChanges()` returns false and handleDefault drops the entry
    // before a row is written.
    //
    // This matters far beyond tidiness. TC-11-04 step 2 tells the executor there
    // is no reason field and to document the reason procedurally — and the
    // obvious workaround, typing the reason into Notes, is EXACTLY the thing
    // that leaves no record. Pinning it here is what keeps that warning in the
    // protocol honest.
    const since = dbNow()
    const subject = seedEquipment({ ...QUIET })
    await waitForTrailAction(subject.id, 'CREATE', since)
    const afterCreate = trailFor(subject.id, since).length

    const res = sqlAsAppUser(
      `UPDATE equipment
          SET notes = 'Taken out of service: failed verification against the reference weight',
              description = 'Reason recorded here by the operator',
              updated_at = NOW()
        WHERE id = ${q(subject.id)};`,
      { userId: EQUIPMENT.admin.user.id, companyId: COMPANY_ID },
    )
    expect(res.ok, `the edit itself must succeed: ${res.error}`).toBe(true)
    expect(
      sqlValue(`SELECT notes FROM equipment WHERE id = ${q(subject.id)}`),
      'the note really was stored — so "no audit row" is about tracking, not about a failed write',
    ).toMatch(/failed verification/i)

    // A negative across an asynchronous hop needs a settling window, otherwise
    // it passes simply by asking too early. A tracked edit on the same row
    // afterwards is the barrier: once THAT row has landed, the worker has
    // demonstrably drained past the untracked one.
    const tracked = sqlAsAppUser(
      `UPDATE equipment SET location_text = 'EQ-J7 Bench 4' WHERE id = ${q(subject.id)};`,
      { userId: EQUIPMENT.admin.user.id, companyId: COMPANY_ID },
    )
    expect(tracked.ok, `the tracked edit was refused: ${tracked.error}`).toBe(true)
    await waitForTrailAction(subject.id, 'UPDATE', since)

    const rows = trailFor(subject.id, since)
    expect(
      rows.length,
      'exactly one row was added past the CREATE — the tracked one. Notes and description ' +
        'are excluded by design, so a reason typed into Notes leaves NO record.',
    ).toBe(afterCreate + 1)

    const update = rows.find((r) => r.action === 'UPDATE')
    expect(Object.keys(update.new), 'and the row that did land carries the tracked field').toContain(
      'locationText',
    )
    expect(
      Object.keys(update.new).some((k) => /^(notes|description)$/.test(k)),
      'the untracked columns are absent from the diff even on a row that was written',
    ).toBe(false)
  })

  test('audit rows cannot be edited or deleted, by anyone', async () => {
    // TC-11-06 step 4, and one of the six controls §5 of the protocol lists as
    // untested. `audit_logs_immutable` RAISEs unconditionally — there is no
    // permission arm and therefore no bypass, so the superuser connection is
    // refused exactly as `app_user` is. This is also why this whole file scopes
    // its counts to a time window instead of cleaning up after itself.
    const since = dbNow()
    const subject = seedEquipment({ ...TRAIL })
    const rowId = await waitForTrailAction(subject.id, 'CREATE', since)

    const attempts = [
      { what: 'UPDATE', stmt: `UPDATE audit_logs SET action = 'TAMPERED' WHERE id = ${q(rowId)}` },
      { what: 'DELETE', stmt: `DELETE FROM audit_logs WHERE id = ${q(rowId)}` },
      {
        what: 'soft delete',
        stmt: `UPDATE audit_logs SET deleted_at = NOW() WHERE id = ${q(rowId)}`,
      },
    ]
    for (const { what, stmt } of attempts) {
      let refused = false
      let message = ''
      try {
        sql(stmt)
      } catch (err) {
        refused = true
        message = `${err.stderr ?? err.message ?? err}`
      }
      expect(refused, `a superuser ${what} on audit_logs was NOT refused`).toBe(true)
      expect(message).toMatch(/audit_logs rows are immutable/i)
    }

    expect(
      sqlValue(`SELECT action FROM audit_logs WHERE id = ${q(rowId)}`),
      'the row is untouched after three attempts',
    ).toBe('CREATE')
    // Boolean, not a NULL comparison — see the note on the reinstatement test:
    // a lone NULL column comes back as JS `null`, which is also what a missing
    // row returns, so `.toBe('')` would pass on a row that had been deleted.
    expect(
      sqlValue(`SELECT deleted_at IS NULL FROM audit_logs WHERE id = ${q(rowId)}`),
      'and the soft-delete attempt left no tombstone either',
    ).toBe('t')
  })

  // ── 3 · Who may read it ───────────────────────────────────────────────────

  test('the trail is gated on audit_trail:read — the register owner who made the change cannot read it', async () => {
    // TC-11-06's opening warning, asserted. `audit_log_select_rls` has three
    // admitting arms and only two can ever fire for this module:
    //   • owner bypass
    //   • authz.has_permission('audit_trail', 'read')
    //   • the subject module's own `read` — via audit_entity_types, which maps
    //     'Equipment' → 'calibration_equipment'… a module with NO read action.
    // So the third arm is structurally dead here, and the consequence is the
    // inversion this test pins: `equipment_sel` is a bare company_id match, so
    // EVERY member of the tenant reads the register — while the person who owns
    // it and personally made every change reads NONE of its history.
    const since = dbNow()
    const subject = seedEquipment({ ...TRAIL })
    await waitForTrailAction(subject.id, 'CREATE', since)

    // The premise, asserted rather than assumed — this is the mapping that makes
    // the third arm dead, and if it ever changes this test should say why.
    expect(
      sqlValue(`SELECT module_id FROM audit_entity_types WHERE id = 'Equipment'`),
      'Equipment audit rows resolve to the calibration_equipment module',
    ).toBe('calibration_equipment')
    expect(
      sqlValue(
        `SELECT count(*) FROM authz.module_actions
          WHERE module_id = 'calibration_equipment' AND action_id = 'read'`,
      ),
      'calibration_equipment has NO read action (migration 20260810170000 dropped it), ' +
        'so audit_log_select_rls’s module-read arm can never admit an Equipment row',
    ).toBe('0')

    // GRANTED. `auditor` holds audit_trail:read at tenant scope — the positive
    // control, without which every denial below is equally consistent with "the
    // worker never wrote the rows".
    const granted = trailRowsVisibleTo(USERS.auditor.id, subject.id)
    expect(
      granted,
      'the audit function reads the instrument’s history — the policy is MATCHING, not merely empty',
    ).toBeGreaterThanOrEqual(1)

    // DENIED, and this is the surprising one: qcAuthor owns the register
    // (calibration_equipment create + update + delete) and authored the row.
    expect(
      trailRowsVisibleTo(EQUIPMENT.admin.user.id, subject.id),
      'the register OWNER cannot read the register’s history — holding every write verb on ' +
        'calibration_equipment confers nothing on audit_trail',
    ).toBe(0)
    expect(
      trailRowsVisibleTo(EQUIPMENT.technician.user.id, subject.id),
      'nor can the technician who holds update',
    ).toBe(0)
    expect(trailRowsVisibleTo(USERS.noAccess.id, subject.id), 'nor a zero-grant member').toBe(0)

    // The control that stops the three denials above being vacuous: the same
    // three personas DO read the instrument itself. So the variable between the
    // register and its trail is `audit_log_select_rls` and nothing else.
    for (const user of [EQUIPMENT.admin.user, EQUIPMENT.technician.user, USERS.noAccess]) {
      const visible = sqlAsAppUser(
        `SELECT 'RESULT=' || count(*)::text FROM equipment WHERE id = ${q(subject.id)};`,
        { userId: user.id, companyId: COMPANY_ID },
      )
      expect(
        /RESULT=1/.test(visible.output),
        `${user.email} sees the instrument but not its history (output: ${visible.output})`,
      ).toBe(true)
    }
  })

  test('the Audit Logs page bounces a persona without the grant, and serves one with it', async ({
    browser,
  }) => {
    // OBSERVATION, and a CORRECTION to the protocol.
    //
    // TC-11-06's warning says the page "renders EMPTY rather than denied" for a
    // persona without the grant, and instructs the executor to confirm the grant
    // before recording anything. That was true of the DATA path and is still
    // true of it — `audit_log_select_rls` returns zero rows rather than raising,
    // which is exactly what the previous test measures. It is NOT true of the
    // ROUTE any more: `src/router/permissionGuard.js` carries
    // `'audit-logs': 'audit_trail:read'` in ADMIN_PERMISSIONS, so the page is
    // now refused outright at /no-access.
    //
    // Both halves are asserted because they disagree, and because an executor
    // reading the stale note would mis-record whichever one they hit.
    //
    // ⚠ THROWAWAY CONTEXTS, NOT THE PERSONA POOL. The pool exists so the
    // register's IndexedDB bootstrap is paid once per persona per file, and it
    // is the right tool for every journey that stays inside /equipment. This
    // one deliberately leaves: a bounced persona ends on /no-access, which is
    // rendered without the app shell, so the pooled page comes back with its
    // live-query host torn down. The next journey to reuse that page then finds
    // an empty register and fails in `openRegister` with "the register never
    // hydrated" — a sync-bootstrap message for what is really a navigation this
    // test did three journeys earlier. Measured: it made the export journey
    // below flaky and nothing else in the file moved.
    const deniedCtx = await browser.newContext({ storageState: EQUIPMENT.admin.auth })
    const denied = await deniedCtx.newPage()
    try {
      await denied.goto('/audit-logs')
      await expect(
        denied,
        'the route guard refuses the register owner outright — the protocol’s "renders empty" ' +
          'note describes the DATA path, not the route',
      ).toHaveURL(/\/no-access/, { timeout: 60_000 })
    } finally {
      await deniedCtx.close()
    }

    // THE POSITIVE HALF, and it is not optional: without it "the guard bounces
    // everybody" — a guard reading the wrong permission string, say — would
    // satisfy the assertion above and look like a working gate.
    const allowedCtx = await browser.newContext({ storageState: AUTH.auditor })
    const allowed = await allowedCtx.newPage()
    try {
      await allowed.goto('/audit-logs')
      await expect(
        allowed,
        'the audit function reaches the page the register owner cannot',
      ).toHaveURL(/\/audit-logs/, { timeout: 60_000 })
      await expect(
        allowed.getByRole('heading', { name: /Audit Log/i }).first(),
        'and the page renders rather than merely accepting the URL',
      ).toBeVisible({ timeout: 90_000 })
    } finally {
      await allowedCtx.close()
    }
  })

  // ── 4 · The list is the whole read surface ────────────────────────────────

  test('there is no per-instrument route — an id path lands on the 404 page', async ({
    browser,
  }) => {
    // The absence EQ-J6 depends on, asserted from the other end. EQ-J6 proves
    // the calibration reminder's deep link resolves to `/equipment` with NO id
    // appended; this proves why that matters — appending one lands nowhere.
    // Together they are the pair, and neither is worth much alone.
    //
    // ⚠ THE URL IS NOT THE ASSERTION. `src/pages/` is file-routed and holds
    // `equipment/index.vue` and nothing else, so an id path falls through to
    // the catch-all `[...all].vue`. A catch-all does not REDIRECT: the address
    // bar keeps reading `/equipment/<uuid>` while the page renders the 404.
    // An assertion that the URL changed therefore fails against a product
    // behaving exactly as documented — which is how this was first written,
    // and why the note is here.
    //
    // ── AND WHY THIS HAS ITS OWN CONTEXT ────────────────────────────────────
    // Same reason as the route-guard journey above, and the same measured
    // symptom. The catch-all renders with `meta.layout: false`, so the app
    // shell — and with it the syncEngine's live-query host — is torn down. A
    // POOLED page left on this route comes back to /equipment with nothing in
    // IndexedDB and no re-bootstrap (the `bootstrapGate` skips one while the
    // data is under five minutes old), so the NEXT journey to reuse it fails in
    // `openRegister` with "the register never hydrated" — a sync-bootstrap
    // message for a navigation some other test performed. A throwaway context
    // confines the teardown to the test that caused it.
    const ctx = await browser.newContext({ storageState: EQUIPMENT.admin.auth })
    const page = await ctx.newPage()
    try {
      const subject = seedEquipment({ ...LIFECYCLE })
      await page.goto(`/equipment/${subject.id}`)
      await expect(
        page.getByText('404', { exact: true }).first(),
        'no per-instrument route exists — the catch-all renders, so a reminder deep-link that ' +
          'appended an instrument id would land here rather than on the record',
      ).toBeVisible({ timeout: 30_000 })
      await expect(page.getByText('Oops. Nothing here...')).toBeVisible()
      expect(
        new URL(page.url()).pathname,
        'and the address bar still reads the id path — the catch-all does not redirect, ' +
          'so "the URL changed" is NOT the way to detect a missing route here',
      ).toBe(`/equipment/${subject.id}`)
    } finally {
      await ctx.close()
    }
  })

  test('the register is the only equipment surface, and the list is the only export', async ({
    browser,
  }) => {
    // TC-11-06 step 5 / the protocol's "no print module and no per-record
    // export" note. With no detail page there is nowhere to put a per-record
    // history view and nowhere to print from — the list's CSV export IS the
    // export, and it carries CURRENT calibration and maintenance dates only,
    // because no history is stored (TC-11-02 step 5).
    const page = await pool.page(browser, EQUIPMENT.admin.auth)

    // ANCHORED ON A SEEDED ROW, not on one this test minted.
    //
    // This journey is about the export CONTROL, not about any particular
    // instrument, so it has no reason to depend on a row reaching IndexedDB.
    // A row written by raw `sql()` gets there only through a fresh bootstrap —
    // the INSERT fires the audit trigger, but the sync broadcast is a separate
    // hop, and a context that bootstrapped before the INSERT will not see it
    // (nor will a reload: the `bootstrapGate` in localStorage skips
    // re-bootstrapping while the data is under five minutes old). EQ-J1's
    // retire journey has the long version of this. `EQUIPMENT.calDue` is in
    // `database/e2e-seed.sql` §36 and is therefore in every bootstrap, which
    // makes the wait a real hydration barrier rather than a race.
    await openRegister(page, { anchorName: EQUIPMENT.calDue.name })
    await expect(registerRow(page, EQUIPMENT.calDue.name)).toBeVisible({ timeout: 60_000 })

    // The export affordance. `DataTable` renders it as a bare <button> whose
    // accessible name is "Export" and, with `exportManager`, opens a column
    // picker rather than downloading immediately.
    const exportButton = page.getByRole('button', { name: 'Export', exact: true }).first()
    await expect(exportButton, 'the register offers a CSV export').toBeVisible({ timeout: 30_000 })
    await exportButton.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Choose columns and format')).toBeVisible({ timeout: 20_000 })

    // The columns an auditor needs are offered. Both DUE dates, because the
    // export's whole value in an inspection is answering "what is out of
    // calibration" off one file.
    await expect(
      dialog.getByText('Next calibration', { exact: false }).first(),
      'the export can carry the calibration due date',
    ).toBeVisible()
    await expect(dialog.getByText('Next PM', { exact: false }).first()).toBeVisible()

    const download = page.waitForEvent('download', { timeout: 60_000 })
    await dialog.getByRole('button', { name: 'Export', exact: true }).click()
    const file = await download
    expect(file.suggestedFilename(), 'the register exports as CSV').toMatch(/\.csv$/)

    // ── What the export CANNOT carry, pinned as behaviour ─────────────────
    // Only the CURRENT calibration is on the row, so no export of any shape can
    // produce a calibration history. That is TC-11-02 step 5's deviation, and it
    // is asserted here at the schema so a future "add history" change is
    // noticed rather than assumed.
    expect(
      sql(
        `SELECT table_name FROM information_schema.tables
          WHERE table_name ~* '^(equipment_)?calibration(s|_history|_records)?$'`,
      ),
      'there is no calibration-history table — each calibration OVERWRITES the equipment row, ' +
        'so the audit trail and the signature ledger are the only surviving record of a prior one',
    ).toBe('')
  })

  test('a calibration completion leaves both an audit diff and a signature — the pair an inspector asks for', async ({
    browser,
  }) => {
    // The bridge between URS-EQP-02 (already covered by EQ-J2, which asserts the
    // signature) and URS-EQP-06 (this file). EQ-J2 proves the calibration is
    // signed; nothing proved the same act is also AUDITED, with the superseded
    // certificate recoverable from the diff. Since the equipment row stores only
    // the CURRENT certificate, that diff is the only place the previous one
    // survives — which makes it the exact record a certificate-swap tamper would
    // have to defeat.
    const page = await pool.page(browser, EQUIPMENT.admin.auth)
    const code = 'E2E-EQ-J7-CERT'
    purgeEquipmentByCode(code)
    try {
      const created = await restPost(page, '/equipment', {
        code,
        name: 'E2E J7 Torque Tester (certificate trail)',
        category: 'INSTRUMENT',
        siteId: SITES.primary.id,
        requiresCalibration: true,
        calibrationInterval: 6,
        calibrationIntervalUnit: 'MONTH',
        nextCalibrationDue: new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10),
      })
      expect(created.status(), `arrange failed: ${await created.text()}`).toBe(201)
      const subject = findEquipmentByCode(code)

      const since = dbNow()
      const certificate = `CAL-J7-${Date.now()}`
      const recorded = await restPost(page, `/equipment/${subject.id}/record-calibration`, {
        certificateNumber: certificate,
        calibrationVendorName: 'E2E Metrology Bench',
        method: 'PIN',
        token: '12345678',
      })
      expect(recorded.status(), `record-calibration failed: ${await recorded.text()}`).toBe(200)

      await waitForTrailAction(subject.id, 'UPDATE', since)
      const rows = trailFor(subject.id, since)
      const diff = rows.find((r) => r.action === 'UPDATE' && r.new?.lastCalibrationCertificateNumber)
      expect(
        diff,
        'the completion produced an audit row carrying the certificate — untracked, a silent ' +
          'certificate swap would leave no trace whatsoever',
      ).toBeTruthy()
      expect(diff.new.lastCalibrationCertificateNumber).toBe(certificate)
      expect(
        Object.keys(diff.new),
        'and the schedule roll-forward is in the same diff',
      ).toContain('nextCalibrationDue')

      // The signature half. `signatures.equipment_id` (migration 20260911110000)
      // is the Part 11 record; the audit row is the GxP one. An inspector asks
      // for both and they must agree on who and when.
      const signedBy = sqlValue(
        `SELECT user_id FROM signatures WHERE equipment_id = ${q(subject.id)}
          ORDER BY signed_at DESC LIMIT 1`,
      )
      expect(signedBy, 'the completion manifested a signature').toBe(EQUIPMENT.admin.user.id)
      expect(
        diff.performedBy,
        'and the audit row names the same person the signature does',
      ).toBe(EQUIPMENT.admin.user.id)
    } finally {
      purgeEquipmentByCode(code)
    }
  })
})
