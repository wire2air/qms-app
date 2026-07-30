// PW-J1 · Recurring program → generator-driven audit instance (MTC-05).
//
// The daily generator (worker/tasks/generate_due_audit_instances.js) is wired to
// a 02:30 crontab slot, so the journey enqueues the same graphile task directly
// rather than waiting for the cron window — the worker polls every 2s, so the
// barrier below is short.
//
// The second test documents inventory finding #4 (worker-originated writes leave
// NO audit trail) and is expected to FAIL until JOB-02 adopts
// worker/utils/withAuditContext.js. It is deliberately self-contained: Playwright
// restarts the worker process after a failed test and re-runs beforeAll hooks,
// so a shared-setup expected-failure would rewind state for whatever follows it
// (see e2e/README.md).
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, USERS, AUDIT_STANDARD, COMPANY_ID } from '../fixtures/cast.js'
import { dateInDays, enqueueGenerator, selectInDialog } from '../fixtures/audits.js'
import { sql, sqlRow, sqlValue, waitForSqlValue } from '../fixtures/db.js'

test.use({ storageState: AUTH.author })

/** The program's next_due_date is what makes it "due" — pull it into the past. */
function makeProgramDue(programId) {
  sql(`UPDATE audit_programs SET next_due_date = CURRENT_DATE - 1 WHERE id = '${programId}'`)
}

function programRow(programId) {
  const row = sqlRow(
    `SELECT next_due_date::text, active, frequency_id, days_interval FROM audit_programs WHERE id = '${programId}'`,
  )
  return row
    ? {
        nextDueDate: row[0],
        active: row[1] === 't',
        frequencyId: row[2],
        daysInterval: Number(row[3]),
      }
    : null
}

test.describe('PW-J1 · a recurring program mints its own audit', () => {
  test('EVERY_X_DAYS program → generator mints a SCHEDULED instance with the frozen clause list', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const name = `E2E Program J1 ${Date.now()}`

    await page.goto('/audits?tab=programs')
    await page.getByRole('button', { name: 'New Program' }).click()
    await expect(page.getByRole('heading', { name: 'New Audit Program' })).toBeVisible({
      timeout: 20_000,
    })
    await page.getByPlaceholder('e.g. Annual Internal Quality Audit').fill(name)
    await selectInDialog(page, 'Frequency', 'Every X Days')
    // Days Interval only renders once the frequency gate opens.
    await page.getByLabel('Days Interval').fill('30')
    await selectInDialog(page, 'Standard', AUDIT_STANDARD.name)
    await selectInDialog(page, 'Manager', USERS.author.name)
    await page.getByLabel('Next Due').fill(dateInDays(30))
    await page.getByRole('button', { name: 'Create & open' }).click()
    await expect(page).toHaveURL(/\/audits\/programs\/[0-9a-f-]{36}/, { timeout: 45_000 })

    const programId = sqlValue(
      `SELECT id FROM audit_programs WHERE company_id = '${COMPANY_ID}' AND name = '${name}'`,
    )
    expect(programId, 'program row exists').toBeTruthy()
    const before = programRow(programId)
    expect(before.frequencyId).toBe('EVERY_X_DAYS')
    expect(before.daysInterval).toBe(30)

    // Give the program an auditor pool. The generator copies the pool 1:1 onto
    // each minted audit and picks the LEAD from the pool's LEAD members
    // (pickNextLeadAuditor) — the program's `managerUserId` plays no part in
    // that, so without a pool member a generated audit has no team at all.
    const addAuditor = await page.request.post(
      `/api/v1/services/auditPrograms/${programId}/auditors`,
      { data: { userId: USERS.author.id, roleOnAudit: 'LEAD' } },
    )
    expect(addAuditor.ok(), `add program auditor → ${addAuditor.status()}`).toBeTruthy()

    // Leave the program's detail page before the generator runs. Sitting on it
    // corrupts the result: the page's inline auto-save writes its stale
    // nextDueDate back over the worker's advance (pinned by the 🔴 test below),
    // and this test is about the generator, not that race.
    await page.goto('/audits?tab=programs')

    // Nothing is due yet — prove the generator is selective before making it due.
    enqueueGenerator()
    expect(
      Number(
        sqlValue(`SELECT count(*) FROM audit_instances WHERE audit_program_id = '${programId}'`),
      ),
      'a not-yet-due program mints nothing',
    ).toBe(0)

    makeProgramDue(programId)
    enqueueGenerator()

    const instanceId = await waitForSqlValue(
      `SELECT id FROM audit_instances WHERE audit_program_id = '${programId}' ORDER BY created_at DESC LIMIT 1`,
      { timeoutMs: 90_000, label: 'generator minted an instance' },
    )

    const instance = sqlRow(
      `SELECT status_id, audit_number, scheduled_date::text, audit_standard_version_id,
              jsonb_array_length(requirement_schema), program_type_id
         FROM audit_instances WHERE id = '${instanceId}'`,
    )
    expect(instance[0], 'generated audits land SCHEDULED').toBe('SCHEDULED')
    expect(instance[1], 'audit number minted').toMatch(/^AUD-\d{4}-\d{4}$/)
    expect(instance[2], 'scheduled for the date the program was due').toBe(
      sqlValue(`SELECT (CURRENT_DATE - 1)::text`),
    )
    expect(instance[3], 'snapshots the standard EFFECTIVE version').toBe(
      AUDIT_STANDARD.effectiveVersionId,
    )
    expect(Number(instance[4]), 'clause list frozen onto the instance').toBe(3)
    expect(instance[5]).toBe('INTERNAL')

    // The auditor pool is copied onto the audit, and the rotation's pick lands
    // both on lead_auditor_user_id and as the LEAD team row (the team row is
    // what audit_instances_select_rls's membership branch reads).
    const lead = sqlValue(
      `SELECT user_id FROM audit_team_members
        WHERE audit_instance_id = '${instanceId}' AND role_on_audit = 'LEAD' AND deleted_at IS NULL`,
    )
    expect(lead, 'the pool LEAD is seeded onto the audit team').toBe(USERS.author.id)
    expect(
      sqlValue(`SELECT lead_auditor_user_id FROM audit_instances WHERE id = '${instanceId}'`),
      'and is stamped as the audit lead',
    ).toBe(USERS.author.id)

    // The window advanced by exactly one interval, which is also what makes the
    // task idempotent — a same-day re-run sees the bumped date and skips.
    const after = programRow(programId)
    expect(after.nextDueDate).toBe(sqlValue(`SELECT (CURRENT_DATE - 1 + 30)::text`))
    enqueueGenerator()
    await new Promise((r) => setTimeout(r, 8_000))
    expect(
      Number(
        sqlValue(`SELECT count(*) FROM audit_instances WHERE audit_program_id = '${programId}'`),
      ),
      're-running the generator the same day mints nothing more',
    ).toBe(1)

    // The instance is visible in the UI, not just the DB.
    await page.goto('/audits?tab=instances')
    await expect(page.getByText(instance[1]).first()).toBeVisible({ timeout: 30_000 })
  })

  test('🔴 generator-created rows leave no audit trail (finding #4) (FAILS TODAY)', async () => {
    test.setTimeout(120_000)
    // Self-contained: insert the program with SQL (no UI, no shared state) so a
    // failure here can never rewind another test's setup.
    const programId = sqlValue(`
      INSERT INTO audit_programs
        (company_id, name, program_type_id, audit_standard_id, frequency_id, days_interval,
         next_due_date, manager_user_id, active, created_by)
      VALUES
        ('${COMPANY_ID}', 'E2E Program J1-audit ${Date.now()}', 'INTERNAL',
         '${AUDIT_STANDARD.id}', 'EVERY_X_DAYS', 30, CURRENT_DATE - 1,
         '${USERS.author.id}', true, '${USERS.author.id}')
      RETURNING id`)

    enqueueGenerator()
    const instanceId = await waitForSqlValue(
      `SELECT id FROM audit_instances WHERE audit_program_id = '${programId}' ORDER BY created_at DESC LIMIT 1`,
      { timeoutMs: 90_000, label: 'generator minted an instance' },
    )

    // audit_event.js drops the row entirely when payload.user_id is falsy, and
    // JOB-02 never sets app.current_user_id — so the INSERT is absent from the
    // trail rather than recorded with a null actor. Poll, so a slow pipeline
    // can't be mistaken for the defect.
    let rows = 0
    for (let i = 0; i < 10 && rows === 0; i++) {
      rows = Number(
        sqlValue(
          `SELECT count(*) FROM audit_logs WHERE entity_type = 'AuditInstances' AND entity_id = '${instanceId}'`,
        ),
      )
      if (rows === 0) await new Promise((r) => setTimeout(r, 2_000))
    }
    expect(rows, 'a cron-generated audit must still be attributable in audit_logs').toBeGreaterThan(
      0,
    )
  })

  test('🔴 an open program page reverts the generator’s schedule advance (FAILS TODAY)', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    // Found by the first full run of this suite. The program detail page binds
    // next_due_date into a record-bound form with inline auto-save (deep watcher
    // + debounce). When the generator advances the schedule, the change syncs
    // into the open page, the watcher fires, and the page PATCHes its PRE-sync
    // value straight back — silently undoing the advance.
    //
    // Observed on the program row as three writes, in order:
    //   next_due_date = 2026-07-28  (actor null — the backdate below)
    //   next_due_date = 2026-08-27  (actor null — the worker, correct: due + 30)
    //   next_due_date = 2026-08-28  (actor = the signed-in user — the page)
    //
    // Impact outside the test: the daily cron fires at 02:30, and anyone left on
    // a program page overnight reverts that program's advance — so the next
    // audit is minted a full window late, with no trace in audit_logs (the
    // worker's own write is invisible there too, per finding #4).
    //
    // Self-contained, and it never touches a shared fixture.
    const programId = sqlValue(`
      INSERT INTO audit_programs
        (company_id, name, program_type_id, audit_standard_id, frequency_id, days_interval,
         next_due_date, manager_user_id, active, created_by)
      VALUES
        ('${COMPANY_ID}', 'E2E Program J1-writeback ${Date.now()}', 'INTERNAL',
         '${AUDIT_STANDARD.id}', 'EVERY_X_DAYS', 30, CURRENT_DATE + 30,
         '${USERS.author.id}', true, '${USERS.author.id}')
      RETURNING id`)
    sql(`
      INSERT INTO audit_program_auditors (company_id, audit_program_id, user_id, role_on_audit)
      VALUES ('${COMPANY_ID}', '${programId}', '${USERS.author.id}', 'LEAD')`)

    // Open the page and let it hydrate, so the form holds the pre-advance value.
    await page.goto(`/audits/programs/${programId}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('E2E Program J1-writeback', { exact: false }).first()).toBeVisible({
      timeout: 30_000,
    })

    makeProgramDue(programId)
    enqueueGenerator()
    await waitForSqlValue(
      `SELECT id FROM audit_instances WHERE audit_program_id = '${programId}' LIMIT 1`,
      { timeoutMs: 90_000, label: 'generator minted an instance' },
    )
    // Give the page's debounced auto-save time to land its write-back.
    await new Promise((r) => setTimeout(r, 10_000))

    expect(
      programRow(programId).nextDueDate,
      'the generator advanced the schedule from the due date; an open page must not undo it',
    ).toBe(sqlValue(`SELECT (CURRENT_DATE - 1 + 30)::text`))
  })
})
