// PW-J13 · An audit programme's SCHEDULE — projected, advanced, and (not) trailed.
//
// WHY THIS FILE EXISTS
//
// OQ-07 TC-07-02 has five steps and the suite only ever covered two of them.
// PW-J1 proves a due programme mints an instance (steps 1–2); everything about
// the SCHEDULE ITSELF — that it is visible as a plan before any instance
// exists (step 3), that a planned date can be changed and the change lands in
// the audit trail (step 4), and that the generator's advance survives a
// programme page left open — was the "Partial" note against URS-AUD-02 in
// automated-regression-coverage.md §10. This file closes it, and in doing so
// found a real product gap (AUD-D1, below).
//
// THE THREE THINGS PINNED HERE, AND WHY EACH ONE IS NOT COVERED ELSEWHERE
//
//  1. **The plan is visible before it is minted.** Instances are created only
//     when DUE, so a recurring programme's future occurrences exist nowhere as
//     rows. `AuditScheduleCalendar` PROJECTS them from frequency + nextDueDate
//     instead, rendering a dashed "<program> (planned)" chip. That projection
//     IS the audit schedule a reader is shown for TC-07-02 step 3, and nothing
//     asserted it — so a regression that dropped recurring programmes off the
//     calendar (as happened on 2026-08-24, per the component's own header)
//     would pass the whole suite.
//
//  2. **AUD-D1 — a planned-date change leaves no audit-trail entry.** See the
//     KNOWN DEFECT block on that test. Characterisation only: the test asserts
//     the product AS IT IS and goes red the day the gap is closed.
//
//  3. **The generator's advance survives an open programme page.** This is the
//     exact clause the §10 note named. PW-J1 carries a 🔴 expected-failure test
//     for it from when the page's inline auto-save PATCHed its stale
//     nextDueDate back over the worker's advance. That bug is FIXED
//     (AuditProgramsPageId.vue now re-seeds `nextDueDateStr` from a later sync
//     delta, guarded by `isEditingDueDate`), so the behaviour is asserted here
//     as a positive regression guard rather than a documented failure.
//
// EVERY TEST ARRANGES ITS OWN PROGRAMME. Playwright discards the worker after a
// failing test and runs its pending afterAll, so a file-level fixture would
// take every later test down with the first failure. There is no shared state
// in this file at all: each test inserts its own programme with SQL (superuser,
// so RLS and the status guards are out of the picture) and removes it in a
// finally block. The purge in beforeAll/afterAll only sweeps leftovers from
// earlier runs of THIS file, which is what keeps the tenant's AuditProgram
// count — a synced model every browser context bootstraps — from growing run
// over run.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, AUDIT_STANDARD, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { enqueueGenerator } from '../fixtures/audits.js'
import { sql, sqlValue, waitForSqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

/** Everything this file creates is greppable by this prefix. */
const TAG = 'PW-J13'

/**
 * Insert a programme directly, born with the frequency/date the test needs.
 *
 * Deliberately SQL, not the create dialog: PW-J1 already drives that dialog,
 * and a UI create here would make every test in this file depend on the same
 * form staying green. `created_by` is set because the generator reads it as the
 * actor it attributes the mint to (worker/tasks/generate_due_audit_instances.js).
 */
function insertProgram({ name, nextDueSql = 'CURRENT_DATE + 30', daysInterval = 30 }) {
  return sqlValue(`
    WITH ins AS (
      INSERT INTO audit_programs
        (company_id, name, program_type_id, audit_standard_id, frequency_id, days_interval,
         next_due_date, manager_user_id, active, created_by)
      VALUES
        ('${COMPANY_ID}', '${name}', 'INTERNAL', '${AUDIT_STANDARD.id}', 'EVERY_X_DAYS',
         ${daysInterval}, ${nextDueSql}, '${USERS.author.id}', true, '${USERS.author.id}')
      RETURNING id
    ) SELECT id FROM ins`)
}

/**
 * Remove one programme and anything the generator hung off it.
 *
 * NOT audit_logs — that table is append-only (`audit_logs_immutable`), and a
 * DELETE against it raises. The rows this file leaves there are correct history
 * of a real write and are meant to stay.
 */
function removeProgram(programId) {
  if (!programId) return
  const instanceIds = sql(
    `SELECT id FROM audit_instances WHERE audit_program_id = '${programId}'`,
  )
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

/** Sweep every programme an earlier run of this file left behind. */
function purge() {
  const ids = sql(
    `SELECT id FROM audit_programs WHERE company_id = '${COMPANY_ID}' AND name LIKE '${TAG}%'`,
  )
    .split('\n')
    .filter(Boolean)
  for (const id of ids) removeProgram(id)
}

/** Count audit_logs rows for one entity — the trail assertion in both directions. */
function trailRows(entityId) {
  return Number(
    sqlValue(`SELECT count(*) FROM audit_logs WHERE entity_id = '${entityId}'`),
  )
}

test.beforeAll(purge)
test.afterAll(purge)

test.describe('PW-J13 · the audit programme schedule', () => {
  test('a recurring programme is projected onto the annual calendar before any instance exists', async ({
    page,
  }) => {
    // TC-07-02 step 3 — "Confirm the schedule is visible in the programme and,
    // where used, on the audit calendar."
    test.setTimeout(180_000)

    // The calendar opens on the CURRENT year and its year nav is two unlabelled
    // chevron buttons, so rather than drive that nav, the programme is born due
    // inside this year: `date_trunc('year', CURRENT_DATE) + 45 days` is always
    // mid-February of the year on screen. `projectedOccurrences` walks forward
    // from nextDueDate and emits every occurrence whose year matches, past
    // dates included — it is a PLAN view, not an "upcoming" view — so a
    // mid-February anchor renders whatever month the suite runs in.
    const name = `${TAG} calendar ${Date.now()}`
    let programId = null
    try {
      programId = insertProgram({
        name,
        nextDueSql: "date_trunc('year', CURRENT_DATE)::date + 45",
      })
      expect(programId, 'programme row inserted').toBeTruthy()

      expect(
        Number(
          sqlValue(
            `SELECT count(*) FROM audit_instances WHERE audit_program_id = '${programId}'`,
          ),
        ),
        'nothing is minted yet — the calendar must show the PLAN, not a row',
      ).toBe(0)

      await page.goto('/audits?tab=calendar', { waitUntil: 'domcontentloaded' })
      await expect(page.getByText('Annual Audit Schedule')).toBeVisible({ timeout: 45_000 })

      // The chip reads "<program name> (planned)" — AuditScheduleCalendar's
      // projectedOccurrences() + the `a.planned` branch of the chip template.
      await expect(
        page.getByText(`${name} (planned)`, { exact: true }).first(),
        'a recurring programme with no minted instance must still appear on the annual schedule',
      ).toBeVisible({ timeout: 45_000 })
    } finally {
      removeProgram(programId)
    }
  })

  test('KNOWN DEFECT AUD-D1 — changing a planned date writes no audit-trail entry', async () => {
    // ─────────────────────────────────────────────────────────────────────────
    // KNOWN DEFECT (AUD-D1): OQ-07 TC-07-02 step 4 requires that changing a
    // planned date "saves and is recorded in the audit trail". It saves. It is
    // NOT recorded.
    //
    // ROOT CAUSE, verified in source and reproduced live on app-db 2026-09-22:
    // `audit_programs` has no owning module in the worker's audit registry
    // (backend/worker/services/audit/registry/modules/ — `audits.js` registers
    // `audit_instances` and nothing else). `getTableConfig` therefore returns
    // DEFAULT_CONFIG, whose `trackFields` are
    //   ['statusId', 'stateId', 'name', 'title', 'code']
    // Exactly ONE of those five is a column on `audit_programs`: `name`. So
    // `handleDefault` → `hasRelevantChanges` drops every UPDATE that does not
    // touch the programme's name — including next_due_date, frequency_id,
    // days_interval, active (pausing the generator) and manager_user_id.
    //
    // This is the same class of defect the registry's own header documents for
    // RCA, Risk Assessment, Custom Fields, Equipment, Record Links and Field
    // Records: a table that shipped without a registry file and silently
    // inherited five field names it does not have.
    //
    // THIS TEST IS A CHARACTERISATION. It asserts the product as it is so the
    // non-conformance can be tracked, and it is written to go RED the moment a
    // registry module for `audit_programs` lands — at which point delete the
    // defect arm, keep the control, and retire AUD-D1 from §10.
    // ─────────────────────────────────────────────────────────────────────────
    test.setTimeout(120_000)

    const name = `${TAG} trail ${Date.now()}`
    let programId = null
    try {
      programId = insertProgram({ name, nextDueSql: 'CURRENT_DATE + 30' })

      // The CREATE entry lands first (INSERT is never field-filtered). Wait for
      // it: the trail is written by an async graphile job, so a bare read here
      // would race the worker and mis-read a slow pipeline as the defect.
      await waitForSqlValue(`SELECT count(*) FROM audit_logs WHERE entity_id = '${programId}'`, {
        timeoutMs: 45_000,
        label: 'programme CREATE reached the audit trail',
      })
      const afterCreate = trailRows(programId)

      // ── The defect arm. Reschedule, then give the worker the same amount of
      // time the CONTROL below is allowed, so "nothing appeared" cannot be lag.
      sql(`UPDATE audit_programs SET next_due_date = CURRENT_DATE + 99 WHERE id = '${programId}'`)
      expect(
        sqlValue(`SELECT next_due_date::text FROM audit_programs WHERE id = '${programId}'`),
        'the reschedule itself saves — only the trail entry is missing',
      ).toBe(sqlValue(`SELECT (CURRENT_DATE + 99)::text`))

      await new Promise((r) => setTimeout(r, 15_000))
      expect(
        trailRows(programId),
        'KNOWN DEFECT AUD-D1: rescheduling an audit programme writes no audit_logs row ' +
          '(audit_programs has no registry module, so DEFAULT_TRACK_FIELDS drops the UPDATE). ' +
          'When this goes red, the defect is fixed — retire AUD-D1.',
      ).toBe(afterCreate)

      // ── CONTROL. Without this the arm above proves nothing: it would pass
      // identically if the trail were broken for this table in EVERY direction,
      // or if the worker were simply down. Renaming the programme touches the
      // one DEFAULT_TRACK_FIELD that does exist here, so it must be recorded.
      sql(`UPDATE audit_programs SET name = '${name} RENAMED' WHERE id = '${programId}'`)
      await waitForSqlValue(
        `SELECT count(*) FROM audit_logs WHERE entity_id = '${programId}' AND action = 'UPDATE'`,
        { timeoutMs: 45_000, label: 'programme rename reached the audit trail' },
      )
      const renameEntry = sqlValue(
        `SELECT new_value_json::text FROM audit_logs
          WHERE entity_id = '${programId}' AND action = 'UPDATE' ORDER BY performed_at DESC LIMIT 1`,
      )
      // Postgres renders jsonb with spaces after ':' and ',', so parse it
      // rather than matching the rendered text.
      const parsed = JSON.parse(renameEntry)
      expect(
        parsed.name,
        'CONTROL — a name change IS trailed, so the pipeline is alive and the gap above is field-scoped',
      ).toBe(`${name} RENAMED`)
      expect(
        Object.keys(parsed),
        'and the recorded diff carries only the tracked field — nextDueDate is not in it',
      ).not.toContain('nextDueDate')
    } finally {
      removeProgram(programId)
    }
  })

  test("the generator's schedule advance survives a programme page left open", async ({ page }) => {
    // The clause automated-regression-coverage.md §10 named as the untested
    // part of URS-AUD-02. PW-J1 carries the 🔴 version of this from when the
    // page reverted the advance; the re-seed watcher in AuditProgramsPageId.vue
    // fixed it, so this is the positive regression guard.
    //
    // Impact if it regresses: the cron fires at 02:30, and anyone left on a
    // programme page overnight silently pushes that programme's next audit a
    // full window late — with no trace, because of AUD-D1 above.
    test.setTimeout(240_000)

    const name = `${TAG} advance ${Date.now()}`
    let programId = null
    try {
      // Born ALREADY DUE, before the page ever loads. That ordering is
      // deliberate and was learned the hard way: backdating the programme with
      // SQL *after* the page has hydrated fires the page's deep `watch(program)`
      // — which calls the debounced PATCH — in the same flush as the re-seed
      // watcher that maintains `nextDueDateStr`, and whichever loses the race
      // decides the outcome. That is a race the test itself manufactures and no
      // user can hit (nobody rewrites a date behind an open page), and pinning
      // it would report a defect that only exists under raw-SQL tampering. A
      // programme that is already due when the page opens reproduces the REAL
      // scenario — an overnight cron advancing a schedule someone left on
      // screen — with the generator's advance as the only change the page sees.
      //
      // The auditor pool is what the generator picks a LEAD from; without it
      // the mint fails and everything below would be asserting nothing.
      programId = insertProgram({ name, nextDueSql: 'CURRENT_DATE - 1' })
      sql(`
        INSERT INTO audit_program_auditors (company_id, audit_program_id, user_id, role_on_audit)
        VALUES ('${COMPANY_ID}', '${programId}', '${USERS.author.id}', 'LEAD')`)

      await page.goto(`/audits/programs/${programId}`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByText(name, { exact: false }).first()).toBeVisible({ timeout: 45_000 })
      // Let the page settle on the due date before the worker moves it, so the
      // value it could write back is unambiguously the pre-advance one.
      await expect(page.locator('input[type="date"]').first()).toHaveValue(
        sqlValue(`SELECT (CURRENT_DATE - 1)::text`),
        { timeout: 45_000 },
      )

      // Run the generator WHILE the page sits on it.
      enqueueGenerator()
      await waitForSqlValue(
        `SELECT id FROM audit_instances WHERE audit_program_id = '${programId}' LIMIT 1`,
        { timeoutMs: 120_000, label: 'generator minted an instance' },
      )

      // The page's auto-save is debounced at 500ms and only fires after the
      // sync delta reaches it; 15s is far clear of both.
      await new Promise((r) => setTimeout(r, 15_000))

      const expected = sqlValue(`SELECT (CURRENT_DATE - 1 + 30)::text`)
      expect(
        sqlValue(`SELECT next_due_date::text FROM audit_programs WHERE id = '${programId}'`),
        'the generator advanced the schedule by exactly one interval from the due date; ' +
          'an open programme page must not write its pre-sync value back over it',
      ).toBe(expected)

      // And the advance is what makes the task idempotent — re-running the
      // generator the same day must not mint a second audit for this window.
      enqueueGenerator()
      await new Promise((r) => setTimeout(r, 10_000))
      expect(
        Number(
          sqlValue(
            `SELECT count(*) FROM audit_instances WHERE audit_program_id = '${programId}'`,
          ),
        ),
        'the advanced date is the idempotency key — a same-day re-run mints nothing more',
      ).toBe(1)

      // The open page must also be SHOWING the advanced date, not just have
      // refrained from overwriting it: a page that silently displays a stale
      // schedule is how the write-back defect stayed invisible for weeks.
      //
      // Asserted on the <input type="date"> rather than rendered text, because
      // that input IS `nextDueDateStr` — the exact local ref the re-seed
      // watcher maintains, and the value the next debounced PATCH would send.
      // An input's value is what toHaveValue reads, and a date input's value is
      // always yyyy-MM-dd regardless of the browser's display locale.
      await expect(
        page.locator('input[type="date"]').first(),
        'the open page must re-seed its date field to the advanced date, not keep the old one staged',
      ).toHaveValue(expected, { timeout: 60_000 })
    } finally {
      removeProgram(programId)
    }
  })
})
