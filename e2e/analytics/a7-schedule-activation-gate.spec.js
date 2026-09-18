// ANL-A7 · Activating a schedule needs `export`, not `manage`.
//
// ── WHY THE GATE IS ON THAT ACTION AND NOT THE OBVIOUS ONE ──────────────────
// A schedule is a standing instruction to render a report and mail it. The
// natural reading is that editing a schedule is a `manage` question — and that
// reading is wrong, because `manage`-without-`export` would then let someone mail
// themselves, every morning, the exact file the export gate refuses to hand them
// on demand. A recurring delivery is not a lesser act than a download; it is the
// same act, repeated, addressed to an inbox.
//
// So both the INSERT and UPDATE policies carry
//   (is_active = false OR authz.has_permission('reports_dashboards','export'))
// which permits an INACTIVE draft freely and gates only the transition to live.
//
// ── WHY THE `reviewer` PERSONA EXISTS ───────────────────────────────────────
// §31 gives `reviewer` read + manage and deliberately NO export. Without such a
// persona a refusal proves nothing: it is equally consistent with "schedules are
// broken for everyone". `controller` holds all three and is the control.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { ANALYTICS, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlAsAppUser } from '../fixtures/db.js'
import { ensureRollup } from '../fixtures/analytics.js'

const REVIEWER = USERS.reviewer.id // manage, NO export
const CONTROLLER = USERS.controller.id // read + manage + export

// recipients is JSONB here — `[{type,id}]` — and the CHECK is a key WHITELIST:
// only `type` and `id` are permitted, so a schedule cannot carry a free-text
// address under any key name. (analytics_alerts.recipients is uuid[]; the two are
// genuinely different shapes and mixing them up raises a type error that reads
// like schema drift.)
const recipient = (userId) => `'[{"type":"user","id":"${userId}"}]'::jsonb`

// A distinct name per fixture row, because analytics_report_schedules_name_uniq
// is (company_id, report_id, lower(name)) among live rows — two schedules for one
// report cannot share a name. Reusing one name makes the SECOND insert fail on
// uniqueness, which looks exactly like the permission refusal under test.
function insertSchedule(userId, { id, isActive, name }) {
  return sqlAsAppUser(
    `INSERT INTO public.analytics_report_schedules
       (id, company_id, owner_id, report_id, name, cron_expression, timezone,
        recipients, format, is_active)
     VALUES ('${id}', '${COMPANY_ID}', '${userId}', '${ANALYTICS.sharedReport.id}',
             '${name}', '0 7 * * 1', 'America/New_York',
             ${recipient(userId)}, 'xlsx', ${isActive})
     RETURNING id;`,
    { userId, companyId: COMPANY_ID },
  )
}

function activate(userId, id) {
  return sqlAsAppUser(
    `UPDATE public.analytics_report_schedules SET is_active = true WHERE id = '${id}' RETURNING id;`,
    { userId, companyId: COMPANY_ID },
  )
}

const IDS = {
  reviewerDraft: 'e2ea6000-0000-4000-8000-000000000001',
  reviewerLive: 'e2ea6000-0000-4000-8000-000000000002',
  controllerLive: 'e2ea6000-0000-4000-8000-000000000003',
}

test.describe('ANL-A7 · the schedule activation gate', () => {
  test.beforeAll(async () => {
    await ensureRollup()
    sql(`DELETE FROM public.analytics_report_schedules WHERE name LIKE 'ANL-A7%'`)
  })

  test('manage-without-export may create an INACTIVE schedule', async () => {
    // Drafting is not delivering. Refusing this too would make the module unusable
    // for the person who curates reports but does not distribute them.
    const res = insertSchedule(REVIEWER, { id: IDS.reviewerDraft, isActive: false, name: 'ANL-A7 reviewer draft' })
    expect(res.ok, `inactive insert was refused: ${res.error}`).toBe(true)
    expect(
      sql(`SELECT is_active FROM public.analytics_report_schedules WHERE id = '${IDS.reviewerDraft}'`),
    ).toBe('f')
  })

  test('manage-without-export may NOT create an ACTIVE schedule', async () => {
    const res = insertSchedule(REVIEWER, { id: IDS.reviewerLive, isActive: true, name: 'ANL-A7 reviewer live' })
    expect(res.ok, 'the INSERT policy gates is_active on export').toBe(false)
    expect(res.error).toMatch(/row-level security|violates/i)
    expect(
      sql(`SELECT count(*) FROM public.analytics_report_schedules WHERE id = '${IDS.reviewerLive}'`),
    ).toBe('0')
  })

  test('manage-without-export may NOT flip an existing draft live', async () => {
    // The same gate on the UPDATE path. Without it the INSERT check is theatre:
    // insert inactive, update to active, delivered.
    const res = activate(REVIEWER, IDS.reviewerDraft)
    expect(res.ok, 'the UPDATE WITH CHECK gates the transition too').toBe(false)
    expect(
      sql(`SELECT is_active FROM public.analytics_report_schedules WHERE id = '${IDS.reviewerDraft}'`),
      'the draft is still a draft',
    ).toBe('f')
  })

  test('CONTROL · export-holder may create an active schedule', async () => {
    // The control that makes every refusal above meaningful.
    const res = insertSchedule(CONTROLLER, { id: IDS.controllerLive, isActive: true, name: 'ANL-A7 controller live' })
    expect(res.ok, `export-holder was refused: ${res.error}`).toBe(true)
    expect(
      sql(`SELECT is_active FROM public.analytics_report_schedules WHERE id = '${IDS.controllerLive}'`),
    ).toBe('t')
  })

  test('a schedule for a report the owner cannot read is refused', async () => {
    // can_read_analytics_report(report_id) sits in the same WITH CHECK. A schedule
    // is a promise to render something later; accepting one against an unreadable
    // report defers the refusal to a worker tick nobody is watching.
    const res = sqlAsAppUser(
      `INSERT INTO public.analytics_report_schedules
         (company_id, owner_id, report_id, name, cron_expression, timezone, recipients, format, is_active)
       VALUES ('${COMPANY_ID}', '${CONTROLLER}', '${ANALYTICS.privateReport.id}',
               'ANL-A7 unreadable', '0 7 * * 1', 'America/New_York',
               ${recipient(CONTROLLER)}, 'xlsx', false)
       RETURNING id;`,
      { userId: CONTROLLER, companyId: COMPANY_ID },
    )
    expect(res.ok, 'a schedule cannot outlive the reader\'s access to its report').toBe(false)
  })

  test('a recipient cannot smuggle in a free-text address', async () => {
    // The recipients CHECK whitelists the keys `type` and `id` rather than
    // blacklisting anything that looks like an email. A blacklist would have to
    // anticipate every spelling of "address"; a whitelist cannot hold one at all.
    // Without this, a schedule is an open mail relay that renders real data.
    for (const payload of [
      `'[{"type":"user","id":"${CONTROLLER}","email":"attacker@example.com"}]'::jsonb`,
      `'[{"type":"email","id":"attacker@example.com"}]'::jsonb`,
      `'["${CONTROLLER}"]'::jsonb`,
    ]) {
      const res = sqlAsAppUser(
        `INSERT INTO public.analytics_report_schedules
           (company_id, owner_id, report_id, name, cron_expression, timezone, recipients, format, is_active)
         VALUES ('${COMPANY_ID}', '${CONTROLLER}', '${ANALYTICS.sharedReport.id}',
                 'ANL-A7 relay probe', '0 7 * * 1', 'UTC', ${payload}, 'xlsx', false)
         RETURNING id;`,
        { userId: CONTROLLER, companyId: COMPANY_ID },
      )
      expect(res.ok, `an out-of-shape recipient was accepted: ${payload}`).toBe(false)
    }
    sql(`DELETE FROM public.analytics_report_schedules WHERE name = 'ANL-A7 relay probe'`)
  })

  test('an ACTIVE schedule must have at least one recipient', async () => {
    // analytics_report_schedules_active_recipients_chk. An active schedule with an
    // empty recipient list is a job that renders a report every morning and mails
    // it to nobody — indistinguishable, in the run log, from delivery failure.
    const res = sqlAsAppUser(
      `INSERT INTO public.analytics_report_schedules
         (company_id, owner_id, report_id, name, cron_expression, timezone, recipients, format, is_active)
       VALUES ('${COMPANY_ID}', '${CONTROLLER}', '${ANALYTICS.sharedReport.id}',
               'ANL-A7 no recipients', '0 7 * * 1', 'UTC', '[]'::jsonb, 'xlsx', true)
       RETURNING id;`,
      { userId: CONTROLLER, companyId: COMPANY_ID },
    )
    expect(res.ok).toBe(false)
  })

  test.afterAll(() => {
    sql(`DELETE FROM public.analytics_report_schedules WHERE name LIKE 'ANL-A7%'`)
  })
})
