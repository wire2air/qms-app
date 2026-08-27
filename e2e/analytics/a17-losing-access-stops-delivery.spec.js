// ANL-A17 · A schedule outlives the access that justified it.
//
// ── THE ONLY TEST IN THIS SUITE ABOUT A LEAK RATHER THAN A BREAK ────────────
// Every other denial spec here catches something a person would notice: a
// button that refuses, a page that will not open, a figure that comes back
// empty. This one catches the opposite shape, and it is the harder shape.
//
// A scheduled report is a STANDING INSTRUCTION. It is written once, by somebody
// who at that moment had every right to write it, and then it keeps running.
// The person added to the distribution list in March changes team in June and
// loses `reports_dashboards` — and nothing about that change touches the
// schedule row. It still says `is_active = true`, it still names them, and it
// still fires on the first of the month. If delivery resolved the list at SAVE
// time, or simply trusted the row as written, that person would carry on
// receiving the tenant's quality figures by email indefinitely.
//
// Nobody would see anything wrong. There is no error, no refused click, no
// failed job — just an email arriving in an inbox where it should have stopped,
// looking exactly like the eleven that legitimately preceded it. A permissions
// review does not find it either, because it is not a permission anybody still
// holds; it is a permission nobody re-asked about. That is why this is worth
// its own file: the failure signature of the bug is a working feature.
//
// ── SO THE TEST IS A BEFORE AND AN AFTER ON ONE UNCHANGED ROW ───────────────
// The schedule is created once and never edited. Between the two firings the
// only thing that moves is `authz.role_module_permissions` — the role change.
// If the second run delivers what the first one did, the send path is acting on
// a decision that was taken months ago. ANL-A7 pins the gate on ACTIVATING a
// schedule; nothing before this pinned the gate on USING one.
//
// ── WHY THE ACTION IS `export` AND NOT `read` ───────────────────────────────
// The journey is written as losing `reports_dashboards:read`, and losing the
// module does take both. But the question the runner actually asks at send time
// is `has_permission('reports_dashboards','export')`, and the distinction is
// load-bearing rather than pedantic: being mailed a rendered file IS taking the
// numbers out of the system, so somebody who may legitimately read a dashboard
// on screen must still stop receiving it. `auditor` is on the recipient list
// from the first firing for exactly that reason — read, never export, never
// delivered. Without them a green run would be equally consistent with "the
// runner checks read", which is the weaker rule and the one that leaks.
//
// ── WHY THE ASSERTION IS denied_count AND NOT AN ABSENT EMAIL ───────────────
// `run_report_schedules` renders nothing and sends nothing. It queues one
// `export_analytics_report` job per AUTHORISED recipient — one each, because a
// single render mailed to five people carries the first person's scope-resolved
// figures to the other four — and writes one row to `analytics_report_runs`
// saying what it decided. That row is the only place the outcome is observable
// at all: a recipient who was dropped is invisible in an email that does not
// arrive. So the run log is where this spec looks, and the function-layer probe
// below names WHO, which a per-occurrence count cannot.
//
// (The firings that do deliver queue real exports, which the dev worker renders
// and mails to Mailhog — the same path ANL-A6's UI test already exercises.)
import { test, expect } from '../../video/fixtures/videoTest.js'
import { ANALYTICS, COMPANY_ID, ROLES, USERS } from '../fixtures/cast.js'
import { sql, sqlAsAppUser, waitForSqlValue } from '../fixtures/db.js'
import { ensureRollup, clearExportJobs } from '../fixtures/analytics.js'

const MODULE = 'reports_dashboards'
const SCHEDULE_ID = 'e2ea7000-0000-4000-8000-000000000001'
const SCHEDULE_NAME = 'ANL-A17 monthly quality pack'

// Three recipients, because two would not separate the two ways of not being
// delivered to. `controller` is the control that keeps its grants until the last
// test — without them, a run that sends to nobody is indistinguishable from a
// runner that has stopped working. `author` is the person the journey is about.
// `auditor` holds read and has never held export.
const KEEPS = USERS.controller
const LOSES = USERS.author
const READ_ONLY = USERS.auditor

// What e2e-seed.sql §31a grants each role on this module, so a revoke can be put
// back EXACTLY rather than approximately. Restoring the wrong set would leave
// the tenant subtly different for every analytics spec that runs after this one,
// and the resulting failure would point at that spec instead of at this one.
const SEEDED_GRANTS = [
  { roleId: ROLES.author.id, actions: ['read', 'export'] },
  { roleId: ROLES.controller.id, actions: ['read', 'export', 'manage'] },
]

// ── the two probes the runner itself makes, asked the same way ──────────────
// `run_report_schedules` re-authorises each recipient by opening a savepoint,
// setting that person's GUCs, doing SET LOCAL ROLE app_user and asking the
// DATABASE two questions. It deliberately does not re-implement either one:
// there is a single copy of "may this person take these numbers out of the
// system", and a second predicate that means the same thing is a second
// predicate that will eventually disagree with the first.
//
// This helper asks those same two, under the same role, so the spec exercises
// the decision the send path actually consults rather than a paraphrase of it.
const TAG = 'A17='
function sendTimeVerdict(userId) {
  // Tagged rather than located by position: sqlAsAppUser echoes its own
  // set_config() calls first, and a bare "last line" read picks up a GUC echo
  // whenever the query itself returns nothing.
  const res = sqlAsAppUser(
    `SELECT '${TAG}'
        || authz.has_permission('${MODULE}', 'export')::text || '\u001f'
        || COALESCE(public.can_read_analytics_report('${ANALYTICS.sharedReport.id}')::text, 'null');`,
    { userId, companyId: COMPANY_ID },
  )
  if (!res.ok) return { mayExport: null, mayRead: null, deliverable: false, error: res.error }
  const line = res.output
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith(TAG))
  if (!line) return { mayExport: null, mayRead: null, deliverable: false, error: res.output }
  const [mayExport, mayRead] = line.slice(TAG.length).split('\u001f')
  return {
    mayExport: mayExport === 'true',
    mayRead: mayRead === 'true',
    deliverable: mayExport === 'true' && mayRead === 'true',
  }
}

// ── the grant change, which is the only thing that moves in this file ───────
function revokeAnalytics(roleId) {
  sql(`DELETE FROM authz.role_module_permissions
        WHERE company_id = '${COMPANY_ID}' AND role_id = '${roleId}' AND module_id = '${MODULE}'`)
}

function restoreSeededGrants() {
  for (const { roleId, actions } of SEEDED_GRANTS) {
    sql(`INSERT INTO authz.role_module_permissions
           (company_id, role_id, module_id, action_id, scope_id, granted_by)
         SELECT '${COMPANY_ID}', '${roleId}', ma.module_id, ma.action_id, 'tenant', NULL
           FROM authz.module_actions ma
          WHERE ma.module_id = '${MODULE}'
            AND ma.action_id = ANY (ARRAY[${actions.map((a) => `'${a}'`).join(', ')}])
         ON CONFLICT (company_id, role_id, module_id, action_id) DO NOTHING`)
  }
}

// ── firing the schedule, and reading what it decided ────────────────────────
/**
 * Force one run and wait for its row.
 *
 * `force` rather than waiting for the cron: `resolveDue()` fires immediately for
 * a forced run whose next_run_at is still in the future, records it as MANUAL
 * with a NULL occurrence, and — the part that matters here — does NOT advance
 * the schedule. So the row under test is byte-identical before and after, which
 * is the whole premise. A schedule with next_run_at NULL would be ARMED instead
 * of fired even under force, which is why the fixture sets it explicitly.
 *
 * Previous runs are deleted first so `count(*) = 1` is an honest barrier: a
 * forced run has no occurrence, so it sits outside the (schedule_id,
 * scheduled_for) unique index and each firing inserts a fresh row rather than
 * updating the last one.
 */
async function fire(label) {
  sql(`DELETE FROM public.analytics_report_runs WHERE schedule_id = '${SCHEDULE_ID}'`)
  // ⚠️ `::json`, not `::jsonb` — add_job's payload parameter is `json`, and the
  // jsonb cast raises "function graphile_worker.add_job(unknown, jsonb) does not
  // exist", which reads like a missing extension rather than a wrong cast.
  sql(
    `SELECT graphile_worker.add_job('run_report_schedules',
       '{"scheduleId":"${SCHEDULE_ID}","force":true}'::json)`,
  )
  await waitForSqlValue(
    `SELECT count(*) FROM public.analytics_report_runs WHERE schedule_id = '${SCHEDULE_ID}'`,
    { timeoutMs: 90_000, intervalMs: 1_000, label: `run_report_schedules recorded ${label}` },
  )
  return lastRun()
}

// One row per firing, and it is written once — at the end of the run, inside the
// same transaction that queues the exports and advances the schedule. So a row
// appearing means the decision is final; there is no half-written state to race.
function lastRun() {
  const row = sql(
    `SELECT status || '\u001f' || recipient_count || '\u001f' || delivered_count || '\u001f'
         || denied_count || '\u001f' || failed_count || '\u001f' || COALESCE(error_code, '')
         || '\u001f' || trigger_source || '\u001f' || COALESCE(scheduled_for::text, '')
       FROM public.analytics_report_runs
      WHERE schedule_id = '${SCHEDULE_ID}'
      ORDER BY started_at DESC
      LIMIT 1`,
  )
  if (!row) return null
  const [status, recipients, delivered, denied, failed, errorCode, trigger, occurrence] =
    row.split('\u001f')
  return {
    status,
    recipients: Number(recipients),
    delivered: Number(delivered),
    denied: Number(denied),
    failed: Number(failed),
    errorCode: errorCode || null,
    trigger,
    occurrence: occurrence || null,
  }
}

/** is_active + the recipient list + updated_at, as one string to compare. */
function scheduleFingerprint() {
  return sql(
    `SELECT is_active::text || '\u001f' || recipients::text || '\u001f' || updated_at::text
       FROM public.analytics_report_schedules WHERE id = '${SCHEDULE_ID}'`,
  )
}

const state = { fingerprint: null, firstRun: null }

// Each test is the premise of the next one — a grant revoked here is still
// revoked there — so a failure part-way through must stop the file rather than
// let the remaining tests report on a tenant nobody arranged.
test.describe.configure({ mode: 'serial' })

test.describe('ANL-A17 · losing access stops delivery', () => {
  test.beforeAll(async () => {
    await ensureRollup()
    // A crashed earlier run could have left a role stripped. Put the seed's own
    // grants back BEFORE anything is asserted, so this file cannot inherit its
    // own wreckage and then report it as a finding.
    restoreSeededGrants()
    sql(`DELETE FROM public.analytics_report_schedules WHERE name LIKE 'ANL-A17%'`)

    // Created by `controller` through the real gate rather than planted as the
    // superuser: ANL-A7 proves an ACTIVE schedule needs `reports_dashboards:
    // export`, and a fixture that sidestepped that would be testing delivery
    // from a row the product would never have accepted.
    //
    // recipients is JSONB `[{type,id}]` and the CHECK is a key WHITELIST — only
    // `type` and `id` — so the list holds REFERENCES and cannot hold an address.
    // That is the mechanism this entire file depends on: an address is a
    // snapshot of an authorisation decision that keeps asserting itself after
    // the decision has changed, and only a reference can be re-asked.
    //
    // next_run_at is set 30 days out so the crontab's own five-minute fan-out
    // (`next_run_at <= now()`) never picks this schedule up mid-spec and fires
    // an occurrence the assertions did not ask for.
    const created = sqlAsAppUser(
      `INSERT INTO public.analytics_report_schedules
         (id, company_id, owner_id, report_id, name, cron_expression, timezone,
          recipients, format, is_active, next_run_at)
       VALUES ('${SCHEDULE_ID}', '${COMPANY_ID}', '${KEEPS.id}', '${ANALYTICS.sharedReport.id}',
               '${SCHEDULE_NAME}', '0 7 1 * *', 'America/New_York',
               '[{"type":"user","id":"${KEEPS.id}"},
                 {"type":"user","id":"${LOSES.id}"},
                 {"type":"user","id":"${READ_ONLY.id}"}]'::jsonb,
               'xlsx', true, now() + interval '30 days')
       RETURNING id;`,
      { userId: KEEPS.id, companyId: COMPANY_ID },
    )
    if (!created.ok) throw new Error(`ANL-A17 could not seed its schedule: ${created.error}`)
    state.fingerprint = scheduleFingerprint()
  })

  test('the list names three people and only two of them may be sent to', async () => {
    // The premise, at the layer that decides it. Stated before anything fires so
    // a surprising run row later has somewhere to be traced back to.
    const keeps = sendTimeVerdict(KEEPS.id)
    expect(keeps.mayExport, `${KEEPS.name} holds ${MODULE}:export`).toBe(true)
    expect(keeps.mayRead, 'and can still read the shared report').toBe(true)

    const loses = sendTimeVerdict(LOSES.id)
    expect(loses.deliverable, `${LOSES.name} is deliverable TODAY — that is the point`).toBe(true)

    // The distinction the journey's own wording blurs. `auditor` may open this
    // report on screen all day; being mailed the rendered file is a different
    // act, and the send path has to gate on the action that governs it.
    const readOnly = sendTimeVerdict(READ_ONLY.id)
    expect(readOnly.mayRead, 'read is not the thing that is missing').toBe(true)
    expect(readOnly.mayExport, 'export is').toBe(false)
    expect(readOnly.deliverable).toBe(false)
  })

  test('the first firing delivers to the export-holders and records the third as denied', async () => {
    const run = await fire('the first firing')
    state.firstRun = run

    expect(run.recipients, 'all three references resolved to people').toBe(3)
    expect(run.delivered, 'controller and author').toBe(2)
    expect(run.denied, 'auditor — read, but no export').toBe(1)
    // A dispatch failure is an outage, not a permissions statistic, and the
    // runner keeps the two apart on purpose. Asserting zero stops an environment
    // fault from being read as a denial in the runs below.
    expect(run.failed, 'nothing failed to dispatch').toBe(0)

    // PARTIAL is not decoration. Folding "some people got it" into SUCCEEDED is
    // exactly how a send path that quietly stopped reaching half its audience
    // keeps looking green.
    expect(run.status).toBe('PARTIAL')
    expect(run.errorCode, 'a denial is not an error — somebody was still sent to').toBeNull()
    expect(run.trigger, 'a forced run is recorded as MANUAL').toBe('MANUAL')
    expect(run.occurrence, 'and belongs to no cron occurrence').toBeNull()
  })

  test('the role change is completely invisible to the schedule', async () => {
    // June. The person changes team and the module goes with it. Nobody opens
    // the schedule, because nobody remembers that it exists.
    revokeAnalytics(ROLES.author.id)

    const loses = sendTimeVerdict(LOSES.id)
    expect(loses.mayExport, 'the export right is gone').toBe(false)
    // can_read_analytics_report is SECURITY INVOKER, so this IS
    // analytics_reports_select_rls rather than a copy of it: a shared report is
    // readable only through reports_dashboards:read, which went with the module.
    expect(loses.mayRead, 'and so is the ability to read the report at all').toBe(false)

    // The half that makes this a leak rather than a break. The instruction is
    // untouched — same recipients, still active, updated_at not even bumped — so
    // nothing in the row itself will ever stop the delivery.
    expect(scheduleFingerprint(), 'the standing instruction did not change').toBe(state.fingerprint)
    expect(
      sql(
        `SELECT recipients::text FROM public.analytics_report_schedules WHERE id = '${SCHEDULE_ID}'`,
      ),
      'and it still names the person who just lost access',
    ).toContain(LOSES.id)
  })

  test('the very next firing stops delivering to them, and the run log says so', async () => {
    // THE ASSERTION THIS FILE EXISTS FOR. Same row, same recipients, same
    // format, one firing later. The only thing that moved was a grant.
    const run = await fire('the firing after the role change')

    expect(run.recipients, 'still three people on the list').toBe(3)
    expect(run.delivered, 'only the control is sent to now').toBe(1)
    expect(run.denied, 'auditor as before, plus the person who lost the module').toBe(2)
    expect(run.failed, 'refusing somebody is not a dispatch failure').toBe(0)

    // Stated as a delta as well as an absolute, because the absolute alone
    // cannot show that the role change is what caused it.
    expect(
      state.firstRun.delivered - run.delivered,
      'exactly one recipient stopped receiving, and it is the one whose role changed',
    ).toBe(1)
    expect(run.denied - state.firstRun.denied).toBe(1)

    // Withheld and RECORDED. An email that stops arriving proves nothing to an
    // auditor months later; denied_count on a timestamped row does.
    expect(run.status).toBe('PARTIAL')
  })

  test('when nobody left may export, the run is SKIPPED rather than SUCCEEDED', async () => {
    // The end state of the same drift: the last export-holder on the list moves
    // on too. Worth pinning because "it fired and nobody was entitled" and "it
    // fired and everybody got it" must not produce the same row — a schedule
    // reporting SUCCEEDED while reaching nobody is how a dead distribution list
    // survives an access review.
    //
    // Note that `controller` also OWNS this schedule, so this revoke leaves a
    // live schedule owned by somebody who may no longer export. It still fires,
    // deliberately: the row's authority was settled when it was activated, and
    // what stops the leak is the per-recipient re-check rather than the owner's
    // standing. If the owner's permission were the gate, one leaver would
    // silently switch off a distribution list the whole tenant depends on.
    revokeAnalytics(ROLES.controller.id)
    expect(sendTimeVerdict(KEEPS.id).deliverable, 'the last export-holder is gone').toBe(false)

    const run = await fire('the firing with nobody entitled')
    expect(run.recipients, 'the references still resolve to three people').toBe(3)
    expect(run.delivered, 'and not one of them is sent to').toBe(0)
    expect(run.denied).toBe(3)
    expect(run.status, 'it fired and nobody was entitled — that is not a success').toBe('SKIPPED')
    expect(run.errorCode, 'named, so "why did this stop" stays answerable').toBe('ALL_DENIED')
  })

  test.afterAll(() => {
    // Grants first: every later analytics spec assumes §31a's tenant, and a
    // stripped role would make ANL-A4/A6/A7/A9 fail somewhere far from here.
    restoreSeededGrants()
    // analytics_report_runs cascades from the schedule, so this takes the log
    // with it.
    sql(`DELETE FROM public.analytics_report_schedules WHERE name LIKE 'ANL-A17%'`)
    // Any export queued by the delivering firings above would otherwise be
    // rendered and mailed after the suite has moved on, and would dirty the
    // "exactly one job" counts ANL-A6 starts from.
    clearExportJobs()
  })
})
