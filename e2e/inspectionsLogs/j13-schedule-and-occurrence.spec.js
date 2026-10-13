// IL-J13 — URS-LOG-03: entries are SCHEDULED as configured, and a scheduled
// occurrence actually FALLS DUE.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS — and why IL-J6 does not already cover it
//
// `j6-assignment-instance.spec.js` is the DISCHARGE journey: given a due
// occurrence, filling the entry closes it, nobody else may close it, it closes
// once, and it cannot be closed from the wrong book. Every one of those tests
// starts from `createDueInstance()`, which INSERTs the row directly — the
// fixture's own comment says so and gives the right reason (instances come from
// a five-minute cron, no endpoint mints one, and an instance is consumed the
// first time it is filled, so it cannot be a static seed row).
//
// That is correct for the discharge half and it means the SCHEDULER — the half
// URS-LOG-03 is actually about — has never been executed by any test in this
// repository. Nothing has ever asserted that configuring a cadence on a log book
// causes an occurrence to exist. This file does exactly that, end to end:
//
//   1. a cadence is CONFIGURED through the product (PATCH /v1/services/logBooks
//      — the same call the detail page's autosave makes), and the configuration
//      lands on the LOG BOOK;
//   2. the real worker task is run, and it MINTS an occurrence + an inbox task
//      for the configured audience, with the window arithmetic the cron says;
//   3. the occurrence then moves DUE → OVERDUE → MISSED through the real
//      transition task, and a MISSED occurrence's task leaves the inbox.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE 2026-08-06 REDESIGN IS THE TRAP, AND IT IS EASY TO FAIL SILENTLY
//
// Scheduling moved ONTO THE LOG BOOK (`schedule_mode` + `schedule` +
// `grace_minutes` + `generate_tasks`); a `form_assignment` now carries only WHO.
// `form_assignments.schedule` is still a column, is still accepted by
// POST /v1/services/formAssignments, and is READ BY NOTHING — the route's own
// OpenAPI text says "Legacy — accepted and stored, but the schedulers read the
// log book instead". A spec that set the cron on the assignment would apply
// cleanly, look right, and generate nothing forever. The generator's entry
// point is the proof:
//
//     db.LogBook.findAll({ where: { scheduleMode: 'RECURRING', statusId: 'ACTIVE' } })
//     — backend/worker/services/assignment/generator.js
//
// So every schedule assertion below reads `log_books`, never `form_assignments`.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE WORKER IS ENQUEUED AND NOT WAITED FOR
//
// `generate_assignment_instances` is a `*/5 * * * *` crontab entry. Waiting for
// a tick would cost up to five minutes per test and make the result depend on
// where the wall clock happened to fall. Instead each test enqueues the REAL
// task with `graphile_worker.add_job(...)` and polls Postgres for its effect —
// the same idiom `e2e/fixtures/analytics.js` `ensureRollup()` uses, and for the
// same reason: the point is that the product's own scheduler produced the row,
// not that a test hand-wrote one. Nothing here fabricates an occurrence.
//
// Two things about that enqueue are load-bearing:
//   · `add_job`'s payload parameter is `json`, NOT `jsonb`. A `::jsonb` cast
//     raises "function graphile_worker.add_job(unknown, jsonb) does not exist",
//     which reads like a missing extension rather than a wrong cast.
//   · It needs a RUNNING worker. If `./dev.sh`'s worker process is down the
//     job simply queues and every barrier below times out. `expectWorkerAlive`
//     turns that into one legible failure instead of three opaque ones.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE FIXTURE, AND ONE HYGIENE FACT WORTH KNOWING
//
// e2e-seed.sql §47 ("Log Book SCHEDULING") already seeds everything needed:
// **E2E Recurring Round Log** (`E2E-ILRC`), ACTIVE + RECURRING on `* * * * *`
// with windowMinutes 120 / graceMinutes 60, and one assignment naming
// `logOperator` alone. Every-minute is deliberate — the generator materialises
// occurrences whose actionable window still contains `now` rather than rolling
// forward to the next strictly-future one, so a daily cron would mint nothing
// until that minute came round and a test cannot wait for that.
//
// ⚠️ §47's header claims "the `inspectionsLogsSetup` purge sweeps its instances
// like any other." IT DOES NOT. That purge is scoped to §34's two AD_HOC books
// and their two plans (`BOOKS` / `PLANS` in fixtures/inspectionsLogs.setup.js);
// this book is in neither list. So the book accumulates one occurrence per
// minute for as long as the worker runs, and every assertion here is written to
// be indifferent to that backlog: counts are always taken as a DELTA around the
// action, never as an absolute, and the occurrence under test is always located
// by its own `due_at`. `test.afterAll` prunes what this file created so the
// backlog does not grow unboundedly on the suite's account.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { AUTH, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlRow, sqlValue, waitForSqlValue } from '../fixtures/db.js'
import { createPersonaPool } from '../fixtures/inspectionsLogs.js'

// ─── §47's fixture (deliberately NOT added to cast.js) ──────────────────────
//
// cast.js's `INSPECTIONS_LOGS` describes the two AD_HOC books §34 seeds, and
// every other spec in this folder reads it expecting exactly those two. Adding
// a third entry there would put a RECURRING book into a shared object that four
// files iterate, so the ids live here instead — this is the only spec that
// needs them.
const RECURRING = {
  id: 'e2e5b000-0000-4000-8000-000000000012',
  code: 'E2E-ILRC',
  title: 'E2E Recurring Round Log',
  assignmentId: 'e2e5d000-0000-4000-8000-000000000012',
  // §47 names logOperator ALONE — one assignee means one instance per
  // occurrence, so "the generator minted exactly one" is a statement about the
  // generator rather than about how many people it fanned out to.
  assigneeId: USERS.logOperator.id,
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

/** Server clock — never the test machine's, which can be skewed from Postgres. */
function dbNow() {
  return sqlValue(`SELECT now()::text`)
}

/**
 * Fail loudly and once when graphile-worker is not draining.
 *
 * Every barrier in this file is downstream of a queued job. With the worker
 * down they all time out after 90s with a message about the row that never
 * appeared — three separate failures, none of which names the cause. This
 * turns that into one sentence at the top of the run.
 */
function expectWorkerAlive() {
  const booted = sqlValue(
    `SELECT count(*) FROM information_schema.tables
      WHERE table_schema = 'graphile_worker' AND table_name = '_private_known_crontabs'`,
  )
  expect(
    Number(booted),
    'graphile_worker has never booted against this database — start the worker (./dev.sh) before running IL-J13',
  ).toBeGreaterThan(0)
  expect(
    sqlValue(
      `SELECT count(*) FROM graphile_worker._private_known_crontabs
        WHERE identifier = 'assignment-instance-generator'`,
    ),
    'the assignment-instance generator is registered in the live crontab',
  ).toBe('1')
}

/** Enqueue one of the real scheduler tasks. Payload is `json`, not `jsonb`. */
function runWorkerTask(identifier) {
  sql(`SELECT graphile_worker.add_job(${q(identifier)}, '{}'::json)`)
}

/** The log book's schedule configuration, straight from `log_books`. */
function scheduleOf(bookId = RECURRING.id) {
  const row = sqlRow(
    `SELECT schedule_mode, schedule::text, grace_minutes, generate_tasks, status_id
       FROM log_books WHERE id = ${q(bookId)}`,
  )
  if (!row) return null
  return {
    scheduleMode: row[0],
    schedule: JSON.parse(row[1] || '{}'),
    graceMinutes: Number(row[2]),
    generateTasks: row[3] === 't',
    statusId: row[4],
  }
}

/** Occurrences under §47's plan, newest first. */
function occurrences({ since = null, limit = 20 } = {}) {
  const where = since ? `AND created_at > ${q(since)}` : ''
  const out = sql(
    `SELECT id, status_id, assigned_to_user_id, due_at::text, window_opens_at::text,
            window_closes_at::text, grace_until::text,
            coalesce(missed_at::text, ''), coalesce(completed_record_id::text, '')
       FROM assignment_instances
      WHERE form_assignment_id = ${q(RECURRING.assignmentId)} ${where}
      ORDER BY created_at DESC LIMIT ${limit}`,
  )
  if (!out) return []
  return out.split('\n').map((line) => {
    const [id, statusId, assignee, dueAt, opensAt, closesAt, graceUntil, missedAt, recordId] =
      line.split('|')
    return {
      id,
      statusId,
      assignedToUserId: assignee,
      dueAt,
      windowOpensAt: opensAt,
      windowClosesAt: closesAt,
      graceUntil,
      missedAt: missedAt || null,
      completedRecordId: recordId || null,
    }
  })
}

/** The unified-inbox task the generator mints alongside an occurrence. */
function taskForInstance(instanceId) {
  const row = sqlRow(
    `SELECT id, assigned_to, task_kind_id, status_id, source_type, source_id, due_date::text
       FROM task_instances
      WHERE entity_type = 'AssignmentInstance' AND entity_id = ${q(instanceId)}
        AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
  )
  if (!row) return null
  return {
    id: row[0],
    assignedTo: row[1],
    taskKindId: row[2],
    statusId: row[3],
    sourceType: row[4],
    sourceId: row[5],
    dueDate: row[6],
  }
}

/** Minutes between two Postgres timestamps, computed in Postgres. */
function minutesBetween(fromTs, toTs) {
  return Number(
    sqlValue(`SELECT EXTRACT(EPOCH FROM (${q(toTs)}::timestamptz - ${q(fromTs)}::timestamptz)) / 60`),
  )
}

const pool = createPersonaPool()

test.describe('IL-J13 — a configured schedule produces a due occurrence', () => {
  // Every instance this file caused the generator to mint, so the seeded book's
  // unpurged backlog does not grow on this suite's account. Tasks go first —
  // they carry no FK to the instance (entity_type/entity_id is a loose
  // reference), so deleting the instance alone would strand them in the
  // operator's inbox forever.
  const mintedInstanceIds = new Set()

  test.beforeAll(() => {
    expectWorkerAlive()

    // The fixture premise, stated once. A failure here is a seed problem, not a
    // product problem, and saying so up front is worth more than three tests
    // failing with "the generator minted nothing".
    const book = scheduleOf()
    expect(book, `§47's log book ${RECURRING.code} is seeded`).not.toBeNull()
    expect(book.statusId, 'the generator only looks at ACTIVE books').toBe('ACTIVE')
    expect(book.scheduleMode, 'and only at RECURRING ones').toBe('RECURRING')
    expect(
      sqlValue(
        `SELECT count(*) FROM form_assignments
          WHERE id = ${q(RECURRING.assignmentId)} AND active AND deleted_at IS NULL`,
      ),
      "§47's audience plan is active — with no assignment the generator returns early",
    ).toBe('1')
    expect(
      sqlValue(
        `SELECT assigned_user_ids::text FROM form_assignments WHERE id = ${q(RECURRING.assignmentId)}`,
      ),
      'the audience is logOperator alone',
    ).toBe(`{${RECURRING.assigneeId}}`)
  })

  test.afterAll(async () => {
    await pool.close()
    if (mintedInstanceIds.size) {
      const ids = [...mintedInstanceIds].map(q).join(',')
      sql(`DELETE FROM task_instances
             WHERE entity_type = 'AssignmentInstance' AND entity_id IN (${ids})`)
      sql(`DELETE FROM assignment_instances WHERE id IN (${ids})`)
    }
  })

  test('the cadence is CONFIGURED on the log book, through the product', async ({ browser }) => {
    // PATCH /v1/services/logBooks/:id is the exact call LogBookDetailPage's
    // autosave makes (`debouncedSave` → `patch('/v1/services/logBooks/…')`),
    // carrying the same four scheduling keys the Schedule section edits. Driving
    // the endpoint rather than the CronPicker widget is deliberate: the claim
    // under test is that a configured cadence is STORED AND HONOURED, and the
    // widget is one of three ways (Frequency / Presets / Advanced) to produce
    // the same five-field string. The UI half is asserted separately below, by
    // reading the configuration back off the rendered page.
    //
    // logAdmin is the persona because `canUpdate` on that page is
    // `isOwner || book.ownerUserId === me` — and §47 makes logAdmin the book's
    // owner_user_id. An arbitrary permission holder could not edit this book.
    const ctx = await browser.newContext({ storageState: AUTH.logAdmin })
    try {
      const before = scheduleOf()

      // A different, unambiguous cadence: twice an hour rather than every
      // minute. Chosen so the write is observable (it differs from the seed in
      // the one field under test) and so restoring §47's `* * * * *` at the end
      // is a single statement.
      const res = await ctx.request.patch(`/api/v1/services/logBooks/${RECURRING.id}`, {
        data: {
          scheduleMode: 'RECURRING',
          schedule: {
            cron: '0,30 * * * *',
            timezone: 'UTC',
            startOffsetMinutes: 15,
            windowMinutes: 90,
            onWindowExpire: 'MISS',
          },
          graceMinutes: 45,
          generateTasks: true,
        },
      })
      expect(res.ok(), `schedule PATCH failed: ${await res.text()}`).toBe(true)

      const after = scheduleOf()
      expect(after.scheduleMode).toBe('RECURRING')
      expect(after.schedule.cron, 'the cron expression is stored verbatim').toBe('0,30 * * * *')
      expect(after.schedule.timezone).toBe('UTC')
      expect(after.schedule.windowMinutes).toBe(90)
      expect(after.schedule.startOffsetMinutes).toBe(15)
      expect(after.schedule.onWindowExpire).toBe('MISS')
      expect(after.graceMinutes, 'grace is a column on the book, not part of the JSONB').toBe(45)
      expect(after.generateTasks).toBe(true)

      // WHERE THE SCHEDULE DOES *NOT* LIVE. `form_assignments.schedule` is the
      // legacy column no scheduler reads; a regression that started writing the
      // cadence there instead would leave the book correct-looking and mint
      // nothing. Pinning that the audience row was untouched by a schedule
      // write is what makes the "configured as such" claim specific.
      expect(
        sqlValue(
          `SELECT schedule->>'cron' FROM form_assignments WHERE id = ${q(RECURRING.assignmentId)}`,
        ),
        'the cadence is NOT written to the legacy form_assignments.schedule column',
      ).toBeNull()

      // An invalid configuration is refused rather than silently stored — a
      // RECURRING book with no cron would be skipped by
      // `isValidRecurringSchedule` for the rest of its life, in silence.
      const noCron = await ctx.request.patch(`/api/v1/services/logBooks/${RECURRING.id}`, {
        data: { scheduleMode: 'RECURRING', schedule: { timezone: 'UTC' } },
      })
      expect(noCron.status(), 'a RECURRING schedule with no cron is refused').toBe(400)
      expect(
        scheduleOf().schedule.cron,
        'and the refusal left the stored cadence untouched',
      ).toBe('0,30 * * * *')
    } finally {
      // Restore §47's every-minute cadence. Every later test in this file (and
      // any re-run of it) depends on an occurrence being materialisable
      // immediately; leaving the half-hourly cron behind would make them wait
      // up to thirty minutes for a window to open.
      sql(`UPDATE log_books
              SET schedule = '{"cron":"* * * * *","timezone":"UTC","startOffsetMinutes":0,"windowMinutes":120}'::jsonb,
                  grace_minutes = 60, generate_tasks = true, schedule_mode = 'RECURRING',
                  updated_at = NOW()
            WHERE id = ${q(RECURRING.id)}`)
      expect(scheduleOf().schedule.cron, 'the fixture cadence is restored').toBe('* * * * *')
      await ctx.close()
    }
  })

  test('the configured cadence is what the log book page shows back', async ({ browser }) => {
    // The UI half of "configured as such": the Schedule section renders the
    // stored cadence, so a book whose schedule was written by the API reads
    // back correctly on the page an administrator actually uses. `humanizeCron`
    // turns '* * * * *' into prose, so the assertion is on the RECURRING radio
    // being the selected mode plus the timezone and window the JSONB carries —
    // the three values rendered verbatim rather than translated.
    const page = await pool.page(browser, AUTH.logAdmin)
    await page.goto(`/inspections-logs/log-books/${RECURRING.id}`)

    // The page hydrates from IndexedDB, so anchor on the book's own title
    // rather than on the section chrome (which renders before the record
    // arrives — the same trap `openEntry` documents).
    await expect(page.getByText(RECURRING.title).first()).toBeVisible({ timeout: 90_000 })

    const recurringRadio = page.locator('input[type=radio][value="RECURRING"]')
    await expect(recurringRadio).toBeVisible({ timeout: 30_000 })
    await expect(
      recurringRadio,
      'the page shows the book as scheduled, not ad hoc',
    ).toBeChecked()

    await expect(
      page.getByLabel('Entry window (minutes)'),
      'the stored window is rendered as configured',
    ).toHaveValue('120')
    await expect(page.getByLabel('Grace (minutes)')).toHaveValue('60')
    await expect(page.getByLabel('Timezone')).toHaveValue('UTC')
  })

  test('an occurrence FALLS DUE — the generator mints it, with the configured window', async () => {
    test.setTimeout(150_000)
    const since = dbNow()

    // Run the real task. Nothing below inserts an assignment_instances row.
    runWorkerTask('generate_assignment_instances')

    await waitForSqlValue(
      `SELECT count(*) FROM assignment_instances
        WHERE form_assignment_id = ${q(RECURRING.assignmentId)} AND created_at > ${q(since)}`,
      { timeoutMs: 120_000, label: 'the scheduler materialised an occurrence' },
    )

    const minted = occurrences({ since })
    expect(minted.length, 'at least one occurrence fell due').toBeGreaterThan(0)
    for (const o of minted) mintedInstanceIds.add(o.id)

    const occurrence = minted[0]
    expect(occurrence.statusId, 'a freshly materialised occurrence is DUE').toBe('DUE')
    expect(
      occurrence.assignedToUserId,
      'and it is owed by the assignee the audience plan names',
    ).toBe(RECURRING.assigneeId)

    // THE WINDOW ARITHMETIC IS THE "AS CONFIGURED" CLAIM. `computeOccurrenceTimes`
    // derives windowOpensAt = dueAt + startOffsetMinutes, windowClosesAt =
    // windowOpensAt + windowMinutes, graceUntil = windowClosesAt + graceMinutes.
    // §47 configures 0 / 120 / 60, so a row whose spacing does not match those
    // numbers means the generator read a schedule other than this book's — the
    // exact failure the legacy `form_assignments.schedule` column invites.
    expect(
      minutesBetween(occurrence.dueAt, occurrence.windowOpensAt),
      'windowOpensAt = dueAt + startOffsetMinutes (0)',
    ).toBeCloseTo(0, 3)
    expect(
      minutesBetween(occurrence.windowOpensAt, occurrence.windowClosesAt),
      'windowClosesAt = windowOpensAt + windowMinutes (120)',
    ).toBeCloseTo(120, 3)
    expect(
      minutesBetween(occurrence.windowClosesAt, occurrence.graceUntil),
      'graceUntil = windowClosesAt + graceMinutes (60)',
    ).toBeCloseTo(60, 3)

    // `dueAt` is the cron instant itself, and '* * * * *' fires on the minute —
    // so a correctly expanded occurrence lands exactly on a minute boundary.
    // A generator that used `now` instead of the cron expansion would not.
    expect(
      sqlValue(
        `SELECT EXTRACT(SECOND FROM ${q(occurrence.dueAt)}::timestamptz)::numeric = 0`,
      ),
      "due_at sits on a cron minute boundary, not on the worker's tick",
    ).toBe('t')

    // AND IT BECOMES WORK. `generate_tasks = true`, so each occurrence carries
    // an inbox task — the thing the assignee actually sees. Without it the row
    // exists and nobody is ever told.
    const task = taskForInstance(occurrence.id)
    expect(task, 'the occurrence minted a unified-inbox task').not.toBeNull()
    expect(task.assignedTo, 'addressed to the assignee, not the book owner').toBe(
      RECURRING.assigneeId,
    )
    expect(task.taskKindId).toBe('ACTION')
    expect(task.statusId).toBe('ASSIGNED')
    expect(task.sourceType).toBe('AssignmentInstance')
    expect(task.sourceId, 'sourced from the audience plan that generated it').toBe(
      RECURRING.assignmentId,
    )
  })

  test('the generator is idempotent — a second tick does not double-book the same occurrence', async () => {
    test.setTimeout(150_000)

    // Take the CURRENT set of due_at values, then re-run. The unique constraint
    // on (form_assignment_id, due_at, assigned_to_user_id) is what makes
    // `findOrCreate` a no-op on re-entry, and overlapping ticks are normal —
    // the crontab entry fires every five minutes and the task is not
    // serialised. Without this, a restarted worker would hand one assignee two
    // identical obligations for one round of work.
    const beforeDueAts = new Set(occurrences({ limit: 200 }).map((o) => o.dueAt))
    expect(beforeDueAts.size, 'there is at least one occurrence to re-tick over').toBeGreaterThan(0)

    const since = dbNow()
    runWorkerTask('generate_assignment_instances')
    // Give the worker a real chance to do the wrong thing: poll until the job
    // has drained rather than asserting immediately on an empty queue.
    await waitForSqlValue(
      `SELECT count(*) = 0 FROM graphile_worker._private_jobs j
         JOIN graphile_worker._private_tasks t ON t.id = j.task_id
        WHERE t.identifier = 'generate_assignment_instances'`,
      { timeoutMs: 120_000, label: 'the second generator tick drained' },
    )

    const fresh = occurrences({ since })
    for (const o of fresh) mintedInstanceIds.add(o.id)

    // The second tick may legitimately mint occurrences for minutes that have
    // ELAPSED since the first — the cron is every minute. What it must never do
    // is mint a SECOND row for a due_at it already covered.
    for (const o of fresh) {
      expect(
        beforeDueAts.has(o.dueAt),
        `occurrence ${o.id} is for a NEW minute (${o.dueAt}), not a duplicate of one already minted`,
      ).toBe(false)
    }

    const duplicates = sqlValue(
      `SELECT count(*) FROM (
         SELECT due_at, assigned_to_user_id FROM assignment_instances
          WHERE form_assignment_id = ${q(RECURRING.assignmentId)}
          GROUP BY due_at, assigned_to_user_id HAVING count(*) > 1
       ) d`,
    )
    expect(
      Number(duplicates),
      'no (plan, due_at, assignee) triple carries two occurrences',
    ).toBe(0)

    // The constraint is what actually holds — assert it exists, so a dropped
    // index cannot pass this test on the findOrCreate read alone.
    expect(
      sqlValue(
        `SELECT 1 FROM pg_indexes
          WHERE tablename = 'assignment_instances'
            AND indexdef ILIKE '%UNIQUE%'
            AND indexdef ILIKE '%form_assignment_id%'
            AND indexdef ILIKE '%due_at%'
            AND indexdef ILIKE '%assigned_to_user_id%' LIMIT 1`,
      ),
      'the (form_assignment_id, due_at, assigned_to_user_id) uniqueness is live',
    ).toBe('1')
  })

  test('a due occurrence goes OVERDUE, then MISSED, and its task leaves the inbox', async () => {
    test.setTimeout(150_000)

    // Mint a fresh occurrence to drive, so the transition assertions never race
    // whatever the every-minute cron has accumulated.
    const since = dbNow()
    runWorkerTask('generate_assignment_instances')
    await waitForSqlValue(
      `SELECT count(*) FROM assignment_instances
        WHERE form_assignment_id = ${q(RECURRING.assignmentId)} AND created_at > ${q(since)}
          AND status_id = 'DUE'`,
      { timeoutMs: 120_000, label: 'an occurrence to transition' },
    )
    const [occurrence] = occurrences({ since }).filter((o) => o.statusId === 'DUE')
    expect(occurrence, 'a DUE occurrence to drive').toBeTruthy()
    mintedInstanceIds.add(occurrence.id)

    const task = taskForInstance(occurrence.id)
    expect(task.statusId, 'its task starts in the inbox').toBe('ASSIGNED')

    // ── DUE → OVERDUE. The predicate is `status_id = 'DUE' AND due_at < now`.
    // `* * * * *` means due_at is already in the past by the time the row is
    // read, so this needs no clock surgery at all — running the real task is
    // enough. (`transition_assignment_instances` is the every-minute crontab
    // entry that does it in production.)
    runWorkerTask('transition_assignment_instances')
    await waitForSqlValue(
      `SELECT status_id = 'OVERDUE' FROM assignment_instances WHERE id = ${q(occurrence.id)}`,
      { timeoutMs: 120_000, label: 'occurrence went OVERDUE' },
    )
    expect(
      taskForInstance(occurrence.id).statusId,
      'an overdue occurrence is still owed — its task stays in the inbox',
    ).toBe('ASSIGNED')

    // ── OVERDUE → MISSED. This half genuinely needs the clock moved: grace runs
    // 180 minutes past due_at (window 120 + grace 60) and a test cannot wait
    // three hours. Only `grace_until` is back-dated — the transition's own
    // predicate (`grace_until < now`, plus a `KEEP_OPEN` exemption read off the
    // BOOK's schedule) then does the work unmodified. Nothing about the guard is
    // bypassed, only the clock, which is exactly the posture
    // `expireEditWindow` takes for the lock finalizer.
    sql(`UPDATE assignment_instances
            SET grace_until = NOW() - INTERVAL '1 minute', updated_at = NOW()
          WHERE id = ${q(occurrence.id)}`)

    runWorkerTask('transition_assignment_instances')
    await waitForSqlValue(
      `SELECT status_id = 'MISSED' FROM assignment_instances WHERE id = ${q(occurrence.id)}`,
      { timeoutMs: 120_000, label: 'occurrence went MISSED' },
    )

    const missed = occurrences({ limit: 200 }).find((o) => o.id === occurrence.id)
    expect(missed.statusId).toBe('MISSED')
    expect(missed.missedAt, 'a missed occurrence is stamped with WHEN it lapsed').toBeTruthy()
    expect(
      missed.completedRecordId,
      'and it closed without an entry — that is what makes it a compliance gap',
    ).toBeNull()

    // The task is CANCELLED, not left ASSIGNED. A missed occurrence cannot be
    // filled late (fieldRecordService gates submission on DUE/OVERDUE), so a
    // task that stayed in the inbox would be an obligation nobody can ever
    // discharge.
    await waitForSqlValue(
      `SELECT status_id = 'CANCELLED' FROM task_instances
        WHERE entity_type = 'AssignmentInstance' AND entity_id = ${q(occurrence.id)}
          AND deleted_at IS NULL`,
      { timeoutMs: 60_000, label: 'the missed occurrence left the inbox' },
    )
  })

  test('the occurrence reaches its assignee as actionable work in the app', async ({ browser }) => {
    test.setTimeout(150_000)

    const since = dbNow()
    runWorkerTask('generate_assignment_instances')
    await waitForSqlValue(
      `SELECT count(*) FROM assignment_instances
        WHERE form_assignment_id = ${q(RECURRING.assignmentId)} AND created_at > ${q(since)}
          AND status_id IN ('DUE','OVERDUE')`,
      { timeoutMs: 120_000, label: 'an open occurrence for the operator' },
    )
    const open = occurrences({ since }).filter((o) => ['DUE', 'OVERDUE'].includes(o.statusId))
    expect(open.length, 'an open occurrence to look at').toBeGreaterThan(0)
    for (const o of open) mintedInstanceIds.add(o.id)
    const occurrence = open[0]
    const task = taskForInstance(occurrence.id)

    // The product's own deep link for an AssignmentInstance task —
    // `src/utils/taskRoute.js` resolves it to the fill page with BOTH ids, and
    // that is the path the inbox row navigates to. Following it is how a
    // scheduled obligation becomes a fillable form; a generated occurrence that
    // does not land here is a row nobody can act on.
    const page = await pool.page(browser, AUTH.logOperator)
    await page.goto(
      `/inspections-logs/fill?logBookId=${RECURRING.id}&assignmentInstanceId=${occurrence.id}`,
    )

    // The fill page auto-selects the book only once it is in IndexedDB, so the
    // first labelled field is the readiness signal — the same wait-long,
    // reload-once posture `submitEntry` documents (a reload restarts the
    // syncEngine bootstrap from zero, so an impatient loop is slower).
    let ready = false
    for (const budget of [90_000, 45_000]) {
      ready = await page
        .getByLabel('Operator')
        .first()
        .waitFor({ state: 'visible', timeout: budget })
        .then(() => true)
        .catch(() => false)
      if (ready) break
      await page.goto(
        `/inspections-logs/fill?logBookId=${RECURRING.id}&assignmentInstanceId=${occurrence.id}`,
      )
    }
    expect(
      ready,
      `the scheduled occurrence's fill form never rendered — ${RECURRING.code} never reached IndexedDB`,
    ).toBe(true)

    await expect(page.getByLabel('Reading').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save Record' })).toBeVisible()

    // The DB side of the same claim: the task is addressed to this persona and
    // nobody else. `assigned_to` is what the inbox filters on, so an occurrence
    // whose task named the wrong person would render an empty inbox for the
    // operator and a stranger's obligation for someone else.
    expect(task.assignedTo).toBe(USERS.logOperator.id)
    expect(
      sqlValue(
        `SELECT count(*) FROM task_instances
          WHERE entity_type = 'AssignmentInstance' AND entity_id = ${q(occurrence.id)}
            AND assigned_to <> ${q(USERS.logOperator.id)} AND deleted_at IS NULL`,
      ),
      'nobody else was handed this occurrence',
    ).toBe('0')
  })

  test('an AD_HOC book is never scheduled — the generator skips it by construction', async () => {
    test.setTimeout(150_000)

    // The negative arm, and it is not decorative. "Entries are scheduled as
    // configured" is only a real claim if a book configured NOT to be scheduled
    // produces nothing — otherwise every book would mint occurrences and the
    // positive tests above would pass for the wrong reason.
    //
    // §34's two books are AD_HOC with active audience plans, so they are the
    // controlled comparator: same tenant, same generator run, same worker tick,
    // differing only in `schedule_mode`.
    const adHocPlans = sql(
      `SELECT fa.id FROM form_assignments fa
         JOIN log_books lb ON lb.id = fa.log_book_id
        WHERE lb.company_id = ${q(COMPANY_ID)} AND lb.schedule_mode = 'AD_HOC'
          AND fa.active AND fa.deleted_at IS NULL`,
    )
      .split('\n')
      .filter(Boolean)
    expect(adHocPlans.length, 'the tenant has AD_HOC books with an audience').toBeGreaterThan(0)

    const inList = adHocPlans.map(q).join(',')
    const before = Number(
      sqlValue(
        `SELECT count(*) FROM assignment_instances WHERE form_assignment_id IN (${inList})`,
      ),
    )

    runWorkerTask('generate_assignment_instances')
    await waitForSqlValue(
      `SELECT count(*) = 0 FROM graphile_worker._private_jobs j
         JOIN graphile_worker._private_tasks t ON t.id = j.task_id
        WHERE t.identifier = 'generate_assignment_instances'`,
      { timeoutMs: 120_000, label: 'the generator tick drained' },
    )

    expect(
      Number(
        sqlValue(
          `SELECT count(*) FROM assignment_instances WHERE form_assignment_id IN (${inList})`,
        ),
      ),
      'an AD_HOC book generates no occurrences, however many times the scheduler runs',
    ).toBe(before)
  })
})
