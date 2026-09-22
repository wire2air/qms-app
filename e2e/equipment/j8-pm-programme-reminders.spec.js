// EQ-J8 — the preventive-maintenance programme: who gets told, and when.
//
// WHY THIS FILE EXISTS. URS-EQP-03 was scored Partial off EQ-J2's
// "PM is a separate schedule" journey, and the coverage note names exactly what
// was missing: *"raising a task to the responsible person is not covered."*
// That is TC-11-03 step 5, and it is the only part of the PM requirement that
// is not about arithmetic. EQ-J2 proves the DATE moves. Nothing proved anybody
// is ever TOLD.
//
// ── THE ANSWER IS "A NOTIFICATION, NOT A TASK", AND THAT MATTERS ────────────
//
// TC-11-03 step 5 is conditionally worded — *"where PM generates a scheduled
// task"* — and on this product it does not. `task_instances` carries an
// `entity_type` column and, measured live, it has never held the value
// 'Equipment' (the nine values it does hold are Capa, Document, Complaint,
// InspectionLot, DocumentVersion, Nonconformance, ChangeRequest, AuditInstance
// and QualityEvent). What PM raises instead is a row in `notifications`, from a
// nightly cron. That is a materially weaker control — a notification is read
// and dismissed, a task is assigned and tracked to completion — and an executor
// who ticks step 5 off against a notification without recording the difference
// has mis-recorded it. So this file asserts BOTH: the notification that does
// exist, and the task that does not.
//
// ── WHY THE CRON IS DRIVEN DIRECTLY ─────────────────────────────────────────
//
// `send_equipment_pm_due_notification` runs from `worker/crontab` at 03:30 UTC
// (its calibration twin at 03:15, deliberately fifteen minutes apart so the two
// scans never start together). A journey cannot wait for that, so each test
// enqueues the task itself with `graphile_worker.add_job` and lets the running
// worker pick it up — the SAME task the scheduler runs, with the same query and
// the same recipient logic. The only thing not exercised is the crontab line.
//
// ⚠ `add_job`'s payload parameter is `json`, NOT `jsonb`. The analytics suite
// learned this the hard way: a `::jsonb` cast raises "function
// graphile_worker.add_job(unknown, jsonb) does not exist", which reads like the
// task is unregistered. These calls pass no payload at all, so the trap is only
// here as a warning to whoever extends the file.
//
// ── THE THREE THINGS THE SCAN'S WHERE CLAUSE DECIDES ────────────────────────
//
// Each is a way for a reminder to legitimately not arrive, and each is a way for
// a BROKEN reminder to look legitimate — which is why all three are probed with
// a paired positive:
//
//   1. THE WINDOWS ARE EXACT-DAY MATCHES, NOT RANGES. `(next_pm_due::date -
//      CURRENT_DATE) = ANY(ARRAY[30, 7, 0, -1, -7, -14, -30])`. An instrument
//      twelve days out gets NOTHING until day seven. TC-11-05 step 4 states
//      these intervals as fixed and not user-configurable; this is where that
//      claim is tested.
//   2. `requires_pm = false` IS SKIPPED ENTIRELY, and so is RETIRED. Both are
//      correct, and both are silent.
//   3. RECIPIENTS ESCALATE: custodian → department supervisor → company owner,
//      with the owner added only when the item is DUE, OVERDUE or unscheduled.
//      An instrument with no owner and no departmental supervisor therefore has
//      no upcoming-reminder recipient at all.
//
// FIXTURES ARE MINTED PER TEST. Playwright discards the worker after a failing
// test and runs the file's pending afterAll, so anything seeded once at the top
// is gone by the time a later test looks for it. Every test below arranges its
// own instrument.
import { test, expect } from '@playwright/test'
import { COMPANY_ID, DEPARTMENTS, EQUIPMENT, SITES, USERS } from '../fixtures/cast.js'
import { sql, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import {
  createPersonaPool,
  daysBetween,
  findEquipment,
  findEquipmentByCode,
  purgeEquipmentByCode,
  recordPmFromRow,
  openRegister,
  restPost,
} from '../fixtures/equipment.js'

const pool = createPersonaPool()
test.afterAll(() => pool.close())

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

// One code per test, all under the suite's `E2E-EQ-%` prefix so
// `purgeMintedEquipment()` in EQ-J1's beforeAll sweeps anything a crash leaks.
const WINDOW = { code: 'E2E-EQ-J8-WINDOW', name: 'E2E J8 Autoclave (window probe)' }
const ESCALATE = { code: 'E2E-EQ-J8-ESCALATE', name: 'E2E J8 Chiller (escalation probe)' }
const UNTRACKED = { code: 'E2E-EQ-J8-UNTRACKED', name: 'E2E J8 Trolley (PM not required)' }
const RETIRED = { code: 'E2E-EQ-J8-RETIRED', name: 'E2E J8 Old Press (retired)' }
const ROLLFWD = { code: 'E2E-EQ-J8-ROLLFWD', name: 'E2E J8 Mixer (roll forward)' }
const ALL = [WINDOW, ESCALATE, UNTRACKED, RETIRED, ROLLFWD]

/**
 * Mint a PM-tracked instrument whose next-PM lands an exact number of days from
 * today, by INSERT.
 *
 * `CURRENT_DATE + n` rather than a JS-computed date: the scan compares
 * `next_pm_due::date - CURRENT_DATE` in Postgres, and a boundary computed from
 * the test machine's clock is one timezone rollover away from landing on the
 * wrong side of a window. Letting the server do its own arithmetic makes the
 * fixture agree with the query by construction.
 *
 * An INSERT rather than the REST create route because this sets `status_id`
 * directly for the RETIRED probe, and `equipment_status_transition_guard_trg`
 * fires on UPDATE only — a row can be BORN retired but cannot be moved there
 * from IN_SERVICE and back for setup purposes without tripping the guard.
 */
function seedPmInstrument({
  code,
  name,
  daysUntilPm = null,
  requiresPm = true,
  statusId = 'IN_SERVICE',
  ownerUserId = null,
  departmentId = null,
}) {
  purgeEquipmentByCode(code)
  sql(
    `INSERT INTO equipment (id, company_id, code, name, category, site_id, department_id,
        status_id, requires_pm, pm_interval, pm_interval_unit, next_pm_due,
        owner_user_id, created_at, updated_at)
     VALUES (gen_random_uuid(), ${q(COMPANY_ID)}, ${q(code)}, ${q(name)}, 'MACHINE',
        ${q(SITES.primary.id)}, ${departmentId ? q(departmentId) : 'NULL'}, ${q(statusId)},
        ${requiresPm ? 'true' : 'false'}, 3, 'MONTH',
        ${daysUntilPm === null ? 'NULL' : `(CURRENT_DATE + ${Number(daysUntilPm)})`},
        ${ownerUserId ? q(ownerUserId) : 'NULL'}, NOW(), NOW())`,
  )
  const row = findEquipmentByCode(code)
  expect(row, `seeded ${code} is in Postgres`).not.toBeNull()
  return row
}

/**
 * Run the nightly PM scan and WAIT for the worker to have finished it.
 *
 * The barrier is the job row disappearing from graphile-worker's queue, not a
 * fixed sleep. A sleep long enough to be safe on a loaded machine is long
 * enough to make this file the slowest in the project; a sleep short enough to
 * be quick turns every negative assertion into a race that passes for the wrong
 * reason. `_private_jobs` empties when the job is done, which is the actual
 * event being waited for.
 *
 * Returns nothing — callers assert against `notifications`.
 */
async function runPmScan() {
  const jobId = sqlValue(
    `SELECT (graphile_worker.add_job('send_equipment_pm_due_notification')).id`,
  )
  expect(jobId, 'the scan was enqueued — a null id means the task is not registered').toBeTruthy()
  await waitForSqlValue(
    `SELECT count(*) = 0 FROM graphile_worker._private_jobs WHERE id = ${q(jobId)}`,
    { timeoutMs: 90_000, intervalMs: 1_000, label: `PM scan job ${jobId} drained` },
  )
  // The scan's own work is to ENQUEUE `send_notification` jobs, one per
  // (instrument, recipient). Those are separate jobs, so the scan draining is
  // not the same event as the notifications existing — the fan-out has to drain
  // too, or a negative assertion reads a queue that has not run yet.
  //
  // SCOPED TO `send_notification`, deliberately NOT to the whole queue. Other
  // module suites run against this same stack concurrently and keep the queue
  // permanently non-empty; a global barrier would hang for the full timeout on
  // every call and turn this file into the run's bottleneck. The jobKey these
  // jobs carry is `equipment-pm-due:<equipment>:<user>:<window>:<date>`, so the
  // scan's own fan-out is identifiable without waiting on anybody else's work.
  await waitForSqlValue(
    `SELECT count(*) = 0 FROM graphile_worker._private_jobs j
       JOIN graphile_worker._private_tasks t ON t.id = j.task_id
      WHERE t.identifier = 'send_notification'
        AND j.key LIKE 'equipment-pm-due:%'`,
    { timeoutMs: 90_000, intervalMs: 1_000, label: 'the PM reminder fan-out drained' },
  )
}

/** Recipient ids of the PM reminders standing against one instrument. */
function pmRecipients(equipmentId) {
  const out = sql(
    `SELECT DISTINCT user_id FROM notifications
      WHERE notification_type_id = 'EQUIPMENT_PM_DUE' AND resource_id = ${q(equipmentId)}
      ORDER BY user_id`,
  )
  return out ? out.split('\n') : []
}

/** One reminder's title, for the wording assertions. Newest first. */
function pmTitle(equipmentId) {
  return sqlValue(
    `SELECT title FROM notifications
      WHERE notification_type_id = 'EQUIPMENT_PM_DUE' AND resource_id = ${q(equipmentId)}
      ORDER BY created_at DESC LIMIT 1`,
  )
}

/**
 * Clear the reminders standing against an instrument.
 *
 * Safe and necessary, unlike the audit trail: `notifications` is in the audit
 * registry's EXCLUDED_TABLES (it would otherwise audit itself into the ground),
 * carries no immutability trigger, and the scan's idempotency key is
 * `…:<window>:<today>` — so a reminder left over from an earlier probe in the
 * SAME test would make the next window's assertion count it twice.
 */
function clearPmReminders(equipmentId) {
  sql(`DELETE FROM notifications WHERE resource_id = ${q(equipmentId)}`)
}

test.describe('EQ-J8 · the preventive-maintenance programme', () => {
  test.beforeAll(() => {
    for (const e of ALL) purgeEquipmentByCode(e.code)
  })
  test.afterAll(() => {
    // REMINDERS FIRST, AND BY SUBQUERY, NOT BY ID.
    //
    // `notifications.resource_id` is a plain uuid with no FK, so deleting the
    // instrument does not take its reminders with it — and an earlier version
    // of this hook resolved the id with `findEquipmentByCode()` first, which
    // returns null for any row a test had already purged inline. The reminders
    // for those rows survived the run: measured, 22 orphans pointing at
    // instruments that no longer existed. They are not inert, because the
    // scan's idempotency key is `…:<window>:<today>` — an orphan from an
    // earlier run of the SAME day would be counted by the next run's
    // `pmRecipients()` and make a "nobody was reminded" assertion fail for a
    // reason that has nothing to do with the product.
    //
    // Deleting through a subquery on `code` covers both cases in one
    // statement: the row that is still there, and the row whose reminders
    // outlived it. The `E2E-EQ-J8-%` sweep then catches anything a crash left
    // between the two.
    for (const e of ALL) {
      sql(
        `DELETE FROM notifications
          WHERE resource_type = 'Equipment'
            AND resource_id IN (SELECT id FROM equipment WHERE code = ${q(e.code)})`,
      )
      purgeEquipmentByCode(e.code)
    }
    sql(
      `DELETE FROM notifications
        WHERE notification_type_id IN ('EQUIPMENT_PM_DUE', 'EQUIPMENT_CALIBRATION_DUE')
          AND resource_type = 'Equipment'
          AND NOT EXISTS (SELECT 1 FROM equipment e WHERE e.id = resource_id)`,
    )
  })

  // ── 1 · The reminder exists, and reaches the responsible person ───────────

  test('an upcoming PM reminds the custodian and the department supervisor — and nobody else', async () => {
    // TC-11-03 step 5 / TC-11-05 step 3, the part EQ-J2 left open. `author`
    // is the custodian on the instrument; the seeded Quality department's
    // supervisor is `owner`. Seven days out is an UPCOMING window, so the
    // escalation arm must NOT fire — which is the half that makes this an
    // assertion about the escalation rule rather than about a fan-out.
    const subject = seedPmInstrument({
      ...WINDOW,
      daysUntilPm: 7,
      ownerUserId: USERS.author.id,
      departmentId: DEPARTMENTS.quality.id,
    })
    clearPmReminders(subject.id)

    await runPmScan()

    const recipients = pmRecipients(subject.id)
    expect(
      recipients,
      'the custodian is recipient #1 — `equipment.owner_user_id` is who the scan looks for first',
    ).toContain(USERS.author.id)

    // The seeded Quality department's supervisor happens to BE the company
    // owner, so this id arrives through the supervisor arm rather than the
    // escalation one. Asserted by id rather than by role because that is what
    // the scan writes; the escalation arm is isolated in the next test, where
    // the instrument sits in a department with no supervisor at all.
    const supervisor = sqlValue(
      `SELECT supervisor_user_id FROM departments WHERE id = ${q(DEPARTMENTS.quality.id)}`,
    )
    expect(supervisor, 'the fixture department really has a supervisor').toBeTruthy()
    expect(recipients, 'the department supervisor is recipient #2').toContain(supervisor)

    expect(
      recipients.length,
      'and nobody else. A reminder that fanned out to the whole tenant would satisfy every ' +
        '"the right person was told" assertion while being useless in practice.',
    ).toBe(new Set([USERS.author.id, supervisor]).size)

    // The wording carries the horizon, because a reminder that does not say
    // WHEN is just noise. `days_until_due` is computed in Postgres.
    expect(pmTitle(subject.id), 'the reminder names the instrument and the horizon').toMatch(
      /due in 7 days/i,
    )
    expect(pmTitle(subject.id)).toContain(WINDOW.name)

    // TC-11-05's deep-link contract, from the PM end. EQ-J6 asserts the
    // CALIBRATION reminder resolves to the register; this is its twin, and both
    // resolvers key off `resource_type` alone.
    expect(
      sqlValue(
        `SELECT resource_type FROM notifications
          WHERE resource_id = ${q(subject.id)} ORDER BY created_at DESC LIMIT 1`,
      ),
      'the PM reminder deep-links as Equipment, same as the calibration one',
    ).toBe('Equipment')
  })

  test('PM raises a NOTIFICATION and never a task — the weaker control, recorded as such', async () => {
    // TC-11-03 step 5 is conditional: "WHERE PM generates a scheduled task".
    // Here it does not, and the distinction is the finding. A notification can
    // be dismissed and leaves no open item behind; a task_instance is assigned,
    // has a status and a due date, and shows up as outstanding until someone
    // closes it. Recording a notification as satisfying step 5 would overstate
    // the control.
    const subject = seedPmInstrument({
      ...ESCALATE,
      daysUntilPm: 0,
      ownerUserId: USERS.author.id,
      departmentId: DEPARTMENTS.operations.id,
    })
    clearPmReminders(subject.id)

    const tasksBefore = Number(sqlValue('SELECT count(*) FROM task_instances'))
    await runPmScan()

    expect(
      pmRecipients(subject.id).length,
      'the scan did fire for this instrument — otherwise "no task was raised" is vacuous',
    ).toBeGreaterThan(0)

    // KNOWN GAP (not a defect — a documented boundary). No equipment surface
    // creates a task, and `task_instances.entity_type` has never held
    // 'Equipment' in this database. Both halves are asserted: nothing was
    // raised for THIS instrument, and the scan raised no task for anything.
    expect(
      Number(sqlValue(`SELECT count(*) FROM task_instances WHERE entity_id = ${q(subject.id)}`)),
      'PM raises no task against the instrument',
    ).toBe(0)
    expect(
      Number(sqlValue(`SELECT count(*) FROM task_instances WHERE entity_type = 'Equipment'`)),
      "`task_instances` has no Equipment entity type at all — if this is now non-zero, PM " +
        'task-raising has been built and TC-11-03 step 5 can be recorded against it',
    ).toBe(0)
    expect(
      Number(sqlValue('SELECT count(*) FROM task_instances')),
      'the scan created no task instances of any kind',
    ).toBe(tasksBefore)
  })

  test('a due PM escalates to the company owner even when no supervisor is set', async () => {
    // The escalation arm, isolated. `Operations` has a NULL
    // `supervisor_user_id` (live-verified), so recipient #2 does not resolve —
    // and the whole point of the escalation is that a LAPSE cannot go unnoticed
    // because of a gap in the org chart.
    // ⚠ Asked as a BOOLEAN. `sqlValue` renders SQL NULL as '' only when the row
    // carries another column beside it; a query selecting ONE null column
    // produces a blank line that `sql()` trims away, so `sqlRow` returns JS
    // `null` — the same answer it gives for "no such department". Comparing to
    // '' would therefore be satisfied by a missing fixture, which is exactly
    // the premise this test needs to be sure of.
    expect(
      sqlValue(
        `SELECT supervisor_user_id IS NULL FROM departments
          WHERE id = ${q(DEPARTMENTS.operations.id)}`,
      ),
      'the Operations fixture exists and has no supervisor — that absence IS this test',
    ).toBe('t')

    const subject = seedPmInstrument({
      ...ESCALATE,
      daysUntilPm: -7,
      ownerUserId: USERS.author.id,
      departmentId: DEPARTMENTS.operations.id,
    })
    clearPmReminders(subject.id)

    await runPmScan()

    const recipients = pmRecipients(subject.id)
    expect(recipients, 'the custodian is still told').toContain(USERS.author.id)
    expect(
      recipients,
      'and an OVERDUE item escalates to the company owner, routing round the missing supervisor',
    ).toContain(USERS.owner.id)
    expect(pmTitle(subject.id)).toMatch(/overdue by 7 day\(s\)/i)
  })

  // ── 2 · Where the reminder correctly does NOT arrive ──────────────────────

  test('the windows are exact days, not a range — twelve days out is silent', async () => {
    // TC-11-05 step 4's claim that the intervals are fixed, and the trap under
    // it. The scan matches `= ANY(ARRAY[30, 7, 0, -1, -7, -14, -30])`, so an
    // instrument between two windows gets nothing at all. An executor who sets a
    // due date "about a week out" and waits for mail will record a false
    // failure.
    //
    // Both halves in one test, on ONE instrument, so the positive proves the
    // negative was a real miss rather than a broken scan: the same row is silent
    // at twelve days and audible at seven, with only the date changed.
    const subject = seedPmInstrument({
      ...WINDOW,
      daysUntilPm: 12,
      ownerUserId: USERS.author.id,
      departmentId: DEPARTMENTS.quality.id,
    })
    clearPmReminders(subject.id)

    await runPmScan()
    expect(
      pmRecipients(subject.id),
      'twelve days out falls between the 30-day and 7-day windows and is passed over entirely',
    ).toEqual([])

    // Move it onto a window and rerun. Nothing else changes.
    sql(
      `UPDATE equipment SET next_pm_due = (CURRENT_DATE + 7), updated_at = NOW()
        WHERE id = ${q(subject.id)}`,
    )
    await runPmScan()
    expect(
      pmRecipients(subject.id).length,
      'on the window the same instrument is reminded — so the silence above was the RULE, ' +
        'not a broken scan',
    ).toBeGreaterThan(0)
  })

  test('PM tracking is opt-in, and retired gear is excluded — both silently', async () => {
    // The two WHERE-clause exclusions, and both are correct. They are together
    // because they share a failure mode: each one makes a reminder not arrive
    // for a reason that looks exactly like a broken cron from outside.
    const untracked = seedPmInstrument({
      ...UNTRACKED,
      daysUntilPm: 0,
      requiresPm: false,
      ownerUserId: USERS.author.id,
      departmentId: DEPARTMENTS.quality.id,
    })
    // BORN retired, not moved there: `equipment_status_transition_guard_trg`
    // fires on UPDATE only, so an INSERT is the one way to arrange this without
    // the guard having an opinion.
    const retired = seedPmInstrument({
      ...RETIRED,
      daysUntilPm: 0,
      statusId: 'RETIRED',
      ownerUserId: USERS.author.id,
      departmentId: DEPARTMENTS.quality.id,
    })
    // The control: same day-offset, same custodian, same department, tracked
    // and in service. Without it, "neither of the two was reminded" is equally
    // consistent with the scan having done nothing at all.
    const control = seedPmInstrument({
      ...ROLLFWD,
      daysUntilPm: 0,
      ownerUserId: USERS.author.id,
      departmentId: DEPARTMENTS.quality.id,
    })
    for (const row of [untracked, retired, control]) clearPmReminders(row.id)

    await runPmScan()

    expect(
      pmRecipients(control.id).length,
      'the control WAS reminded — the scan ran and matched',
    ).toBeGreaterThan(0)
    expect(
      pmRecipients(untracked.id),
      '`requires_pm = false` opts the instrument out of the programme entirely — no due date ' +
        'is computed and no reminder is ever sent',
    ).toEqual([])
    expect(
      pmRecipients(retired.id),
      'RETIRED gear is excluded from the scan, so retiring an instrument silences its reminders',
    ).toEqual([])
  })

  // ── 3 · Recording the maintenance closes the loop ─────────────────────────

  test('recording the PM rolls the schedule forward and stops the reminders', async ({
    browser,
  }) => {
    // TC-11-03 steps 3 and 4, joined to step 5. EQ-J2 asserts the roll-forward
    // arithmetic in isolation; what it cannot see is the consequence — that the
    // instrument leaves the overdue window and the nightly scan stops chasing
    // it. That loop is what makes the programme a programme rather than a date
    // field.
    const page = await pool.page(browser, EQUIPMENT.admin.auth)
    const subject = seedPmInstrument({
      ...ROLLFWD,
      daysUntilPm: -7,
      ownerUserId: USERS.author.id,
      departmentId: DEPARTMENTS.quality.id,
    })
    clearPmReminders(subject.id)

    await runPmScan()
    expect(
      pmRecipients(subject.id).length,
      'the instrument is being chased before the maintenance is recorded',
    ).toBeGreaterThan(0)
    clearPmReminders(subject.id)

    // Record it through the register's quick action — one click, no dialog and
    // no e-signature. That asymmetry against calibration is deliberate (no QC
    // gate reads PM) and EQ-J2 pins it; here it is simply the path a technician
    // takes.
    await openRegister(page, { anchorName: ROLLFWD.name })
    await recordPmFromRow(page, ROLLFWD.name)
    await expect
      .poll(() => sqlValue(`SELECT next_pm_due > NOW() FROM equipment WHERE id = ${q(subject.id)}`), {
        timeout: 30_000,
        message: 'the next-PM date moved into the future',
      })
      .toBe('t')

    const after = findEquipment(subject.id)
    expect(after.lastPmAt, 'the completion stamped a maintenance date').not.toBeNull()
    // Three MONTHs, in days with tolerance: `addInterval` uses Date.setMonth,
    // so "three months from the 31st" is not 90 days.
    expect(
      daysBetween(after.lastPmAt, after.nextPmDue),
      'next-PM is last-PM plus the instrument’s own PM interval (3 months)',
    ).toBeGreaterThanOrEqual(88)
    expect(daysBetween(after.lastPmAt, after.nextPmDue)).toBeLessThanOrEqual(93)

    // And the loop closes: the next nightly run finds nothing to say.
    await runPmScan()
    expect(
      pmRecipients(subject.id),
      'recording the maintenance takes the instrument out of every window, so the chasing stops',
    ).toEqual([])

    // TC-11-03 step 4 — what is RETAINED. The equipment row holds only the
    // CURRENT maintenance dates; there is no history table and no history view,
    // so a previous PM survives only in the audit trail. Asserted at the schema
    // so the protocol's deviation note stays true or fails loudly.
    expect(
      sql(
        `SELECT table_name FROM information_schema.tables
          WHERE table_name ~* '^(equipment_)?(pm|maintenance)(s|_history|_records)?$'`,
      ),
      'no maintenance-history table exists — each entry OVERWRITES the equipment row, which is ' +
        'TC-11-03 step 4’s deviation',
    ).toBe('')
  })

  test('the PM programme is independent of the calibration one, in the scan as well as the columns', async ({
    browser,
  }) => {
    // EQ-J2 proves the two DATES do not move each other. This is the other half
    // nothing covered: the two nightly SCANS are separate jobs reading separate
    // columns and separate flags, so an instrument can be perfectly calibrated
    // and overdue for maintenance — the state in which a PM reminder is the only
    // warning anyone gets.
    const page = await pool.page(browser, EQUIPMENT.admin.auth)
    const code = 'E2E-EQ-J8-SPLIT'
    purgeEquipmentByCode(code)
    try {
      const created = await restPost(page, '/equipment', {
        code,
        name: 'E2E J8 Oven (calibrated, PM overdue)',
        category: 'MACHINE',
        siteId: SITES.primary.id,
        departmentId: DEPARTMENTS.quality.id,
        requiresCalibration: true,
        calibrationInterval: 12,
        calibrationIntervalUnit: 'MONTH',
        nextCalibrationDue: new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10),
        requiresPm: true,
        pmInterval: 3,
        pmIntervalUnit: 'MONTH',
      })
      expect(created.status(), `arrange failed: ${await created.text()}`).toBe(201)
      const subject = findEquipmentByCode(code)
      sql(
        `UPDATE equipment SET owner_user_id = ${q(USERS.author.id)},
            next_pm_due = (CURRENT_DATE - 7), updated_at = NOW()
          WHERE id = ${q(subject.id)}`,
      )
      clearPmReminders(subject.id)

      const state = findEquipment(subject.id)
      expect(
        new Date(state.nextCalibrationDue).getTime(),
        'the premise: this instrument is well within calibration',
      ).toBeGreaterThan(Date.now())
      expect(new Date(state.nextPmDue).getTime(), '…and overdue for maintenance').toBeLessThan(
        Date.now(),
      )

      await runPmScan()

      expect(
        pmRecipients(subject.id).length,
        'a calibrated instrument is still chased for maintenance — the two programmes do not ' +
          'cover for each other',
      ).toBeGreaterThan(0)
      expect(
        Number(
          sqlValue(
            `SELECT count(*) FROM notifications
              WHERE resource_id = ${q(subject.id)}
                AND notification_type_id = 'EQUIPMENT_CALIBRATION_DUE'`,
          ),
        ),
        'and the PM scan raises no calibration reminder — separate jobs, separate columns',
      ).toBe(0)
    } finally {
      const row = findEquipmentByCode(code)
      if (row) clearPmReminders(row.id)
      purgeEquipmentByCode(code)
    }
  })
})
