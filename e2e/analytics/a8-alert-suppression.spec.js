// ANL-A8 · An alert fires once per band per recipient per window.
//
// ── WHAT MAKES ALERT DEDUPE DIFFERENT FROM ORDINARY DEDUPE ──────────────────
// A threshold alert is evaluated on a tick. The metric that crossed the threshold
// this minute is still across it next minute, so a naive evaluator mails on every
// tick until somebody fixes the underlying number — which trains recipients to
// filter the alert, and the next real one goes unread. Suppression is not polish;
// it is what makes the feature usable at all.
//
// ── WHY IT IS AN EXCLUSION CONSTRAINT AND NOT A "last_fired_at" COLUMN ──────
//   EXCLUDE USING gist (alert_id =, recipient_user_id =, band_key =,
//                       COALESCE(dimension_value,'*') =, suppress_window &&)
// A timestamp column plus an application check is a read-modify-write, and two
// worker ticks racing on the same alert both read "not fired recently" and both
// send. The constraint makes the second insert impossible at the storage layer,
// so the guarantee does not depend on the evaluator being single-threaded.
//
// ── THE PER-RECIPIENT CHECK IS THE SECURITY HALF ────────────────────────────
//   CHECK (evaluated_as_user_id = recipient_user_id)
// An alert says "your number crossed a line". If it were evaluated under the
// author's scope and mailed to a recipient, it would tell them a figure they are
// not allowed to see — in a subject line, outside every RLS policy. The CHECK makes
// that combination unrepresentable rather than merely avoided by convention.
import { test, expect } from '../../video/fixtures/videoTest.js'
import { ANALYTICS, COMPANY_ID, USERS } from '../fixtures/cast.js'
import { sql, sqlAsAppUser } from '../fixtures/db.js'
import { ensureRollup } from '../fixtures/analytics.js'

const ALERT_ID = 'e2ea5000-0000-4000-8000-000000000001'
const OWNER = USERS.author.id

const BANDS = JSON.stringify([
  { key: 'warn', comparator: 'gte', threshold: 1, severity: 'warning', window: 'last_12_months', suppressWindowMinutes: 60 },
  { key: 'crit', comparator: 'gte', threshold: 1000000, severity: 'critical', window: 'last_12_months', suppressWindowMinutes: 60 },
])

const FIRE_TAG = 'FIRE='

function fire(userId, bandKey, value = 6, dimensionValue = null) {
  const dim = dimensionValue === null ? 'NULL' : `'${dimensionValue}'`
  return sqlAsAppUser(
    `SELECT '${FIRE_TAG}' || COALESCE(public.analytics_record_alert_fire(
              '${ALERT_ID}'::uuid, '${bandKey}', ${value}, ${dim},
              '${ANALYTICS.FACT_MONTH.start}', '${ANALYTICS.FACT_MONTH.end}')::text, 'NULL');`,
    { userId, companyId: COMPANY_ID },
  )
}

/**
 * The event id `analytics_record_alert_fire` returned, or null when suppressed.
 *
 * ⚠️ The function `RETURNS uuid` — the new event's id — and its
 * `ON CONFLICT DO NOTHING … RETURNING id` leaves that unset, so a suppressed fire
 * comes back NULL, which psql prints as an EMPTY LINE.
 *
 * Reading the result out of `sqlAsAppUser`'s output is where two traps live, and
 * this file fell into both:
 *
 *  1. "the last non-empty line" lands on the helper's own `set_config` echoes.
 *     The last of those prints **`false`** — the value of
 *     `app.current_user_is_owner` — so an assertion of `'false'` passed while
 *     testing nothing at all.
 *  2. "the last uuid-shaped line" is no better: the preamble also echoes
 *     `app.current_user_id` and `app.current_company_id`, both uuids. Measured —
 *     it returned the company id.
 *
 * Shape cannot separate payload from preamble here, so the query TAGS its own
 * answer and this reads the tag. Do the same in any new probe.
 */
function eventIdReturnedBy(res) {
  const line = res.output.split('\n').find((l) => l.trim().startsWith(FIRE_TAG))
  if (!line) return null
  const value = line.trim().slice(FIRE_TAG.length)
  return value === 'NULL' ? null : value
}

const eventCount = (extra = '') =>
  Number(sql(`SELECT count(*) FROM public.analytics_alert_events WHERE alert_id = '${ALERT_ID}' ${extra}`))

test.describe('ANL-A8 · alert suppression', () => {
  test.beforeAll(async () => {
    await ensureRollup()
    sql(`DELETE FROM public.analytics_alert_events WHERE alert_id = '${ALERT_ID}';
         DELETE FROM public.analytics_alerts WHERE id = '${ALERT_ID}';`)
    // `recipients` is uuid[], not jsonb — a jsonb literal raises "column
    // recipients is of type uuid[]" and reads like a schema drift rather than a
    // wrong cast.
    const res = sqlAsAppUser(
      `INSERT INTO public.analytics_alerts
         (id, company_id, owner_id, name, metric_key, filters, bands, recipients,
          suppress_window_minutes, is_active)
       VALUES ('${ALERT_ID}', '${COMPANY_ID}', '${OWNER}', 'ANL-A8 alert',
               '${ANALYTICS.METRIC}', '{}'::jsonb, '${BANDS}'::jsonb,
               ARRAY['${OWNER}']::uuid[], 60, true)
       RETURNING id;`,
      { userId: OWNER, companyId: COMPANY_ID },
    )
    expect(res.ok, `alert fixture insert failed: ${res.error}`).toBe(true)
  })

  test('the first fire records an event, the second within the window does not', async () => {
    const first = fire(OWNER, 'warn')
    expect(first.ok, `first fire failed: ${first.error}`).toBe(true)
    expect(eventIdReturnedBy(first), 'the first fire returns the new event id').not.toBeNull()
    expect(eventCount(), 'one event after the first fire').toBe(1)

    const second = fire(OWNER, 'warn')
    // Note the shape of the answer: suppression is not an error. The function
    // `RETURNS uuid` — the new event's id — and its `ON CONFLICT DO NOTHING …
    // RETURNING id` simply leaves that unset, so a suppressed fire comes back
    // NULL. Raising instead would make the evaluator's whole tick fail on a
    // metric that is merely still across its threshold.
    expect(second.ok, 'suppression is reported, not raised').toBe(true)
    expect(eventIdReturnedBy(second), 'no new event id came back').toBeNull()
    expect(eventCount(), 'still exactly one event').toBe(1)
  })

  test('the event was evaluated as the person who receives it', async () => {
    // The security half. If these ever diverge, an alert can carry a figure
    // computed under somebody else's access into a recipient's inbox.
    expect(
      sql(`SELECT DISTINCT evaluated_as_user_id = recipient_user_id
             FROM public.analytics_alert_events WHERE alert_id = '${ALERT_ID}'`),
    ).toBe('t')
  })

  test('a different band is a different suppression key', async () => {
    // Bands are an escalation ladder. Sharing one window across them would mean
    // that once `warn` fires, `crit` stays silent for an hour — the ladder would
    // suppress precisely the rung that matters.
    const res = fire(OWNER, 'crit', 1000001)
    expect(res.ok).toBe(true)
    expect(eventCount(`AND band_key = 'crit'`), 'crit fired despite warn being suppressed').toBe(1)
    expect(eventCount(), 'two events, one per band').toBe(2)
  })

  test('a duplicate cannot be forced past the guard even by hand', async () => {
    // The guarantee has to hold against a racing writer, not only against the
    // evaluator's own bookkeeping. Copying a live event row must be refused by the
    // exclusion constraint itself.
    //
    // The column list is read from the catalog rather than typed out: the first
    // draft named `threshold`, the column is `threshold_value`, and the test then
    // failed on a typo while appearing to say the guard was broken. Everything but
    // the primary key is copied — `suppress_window` included, since it is the
    // EXCLUDE key and carries no default.
    sql(
      `DO $probe$
       DECLARE cols text;
       BEGIN
         SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
           INTO cols
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'analytics_alert_events'
            AND column_name <> 'id';
         EXECUTE format(
           'INSERT INTO public.analytics_alert_events (%s) SELECT %s FROM public.analytics_alert_events
             WHERE alert_id = %L AND band_key = %L LIMIT 1',
           cols, cols, '${ALERT_ID}', 'warn');
         RAISE NOTICE 'ACCEPTED';
       EXCEPTION WHEN exclusion_violation THEN
         RAISE NOTICE 'REFUSED';
       END $probe$;`,
    )
    expect(eventCount(`AND band_key = 'warn'`), 'the duplicate did not land').toBe(1)
  })

  test('an inactive alert cannot fire at all', async () => {
    sql(`UPDATE public.analytics_alerts SET is_active = false WHERE id = '${ALERT_ID}'`)
    const res = fire(OWNER, 'warn')
    // Fails CLOSED: an alert someone deliberately switched off must not keep
    // mailing because a tick was already in flight.
    expect(
      !res.ok || eventIdReturnedBy(res) === null,
      'a deactivated alert produces no new event',
    ).toBe(true)
    sql(`UPDATE public.analytics_alerts SET is_active = true WHERE id = '${ALERT_ID}'`)
  })

  test.afterAll(() => {
    sql(`DELETE FROM public.analytics_alert_events WHERE alert_id = '${ALERT_ID}';
         DELETE FROM public.analytics_alerts WHERE id = '${ALERT_ID}';`)
  })
})
