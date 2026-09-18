import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AnalyticsAlertEvent — one alert firing, for ONE named person.
 *
 * ── THE ONE PLACE IN ANALYTICS WHERE A NUMBER IS STORED ─────────────────────
 * Everything else in this layer holds questions and never answers:
 * AnalyticsDashboard stores geometry, AnalyticsWidget stores one question,
 * AnalyticsReport stores a question set, AnalyticsAlert stores a threshold. This
 * table stores `observedValue` — a real, resolved figure — and it is the only
 * one that does.
 *
 * That is safe for exactly one reason, and it is worth stating because the
 * reason is also the constraint that keeps it safe: a row here is scoped to a
 * SINGLE recipient, and `analytics_alert_events_scope_chk` enforces
 * `evaluated_as_user_id = recipient_user_id` in the database. The figure was
 * computed AS the person who is going to read it. The evaluator therefore
 * writes one row per recipient rather than one row per firing — the same
 * structural rule `run_report_schedules` follows when it queues one export job
 * per recipient. Relax that CHECK and this table immediately becomes a way to
 * show one person another person's numbers, with nothing on screen looking wrong.
 *
 * The SELECT policy says the same thing a second way: `recipient_user_id = me`,
 * or company owner. No `:read` branch, no `:manage` branch — an alert event is
 * not a company record that a permission can open, it is one person's copy.
 *
 * ── READ-ONLY, BY GRANT ─────────────────────────────────────────────────────
 * Measured on app-db: `app_user=r/postgres` — SELECT and nothing else. There is
 * no INSERT, UPDATE or DELETE grant and no policy for any of them; rows are
 * written by the evaluator on the worker's connection. So this model exposes no
 * write path: `save()`, `delete()` and `hardDelete()` are inherited from
 * BaseModel and every one of them would 403. Never draw a control that calls
 * one — a button that always fails is worse than an absent feature, because it
 * reads as a broken app rather than a missing one.
 *
 * There is no `paranoid` flag because there is no `deleted_at` column: a firing
 * happened, and unhappening it is not an operation this table offers.
 *
 * ── suppress_window IS DELIBERATELY NOT MODELLED ────────────────────────────
 * The table has a `suppress_window tstzrange` column, maintained by the
 * `analytics_alert_event_window` BEFORE trigger and used by the gist EXCLUDE
 * constraint that actually enforces suppression. It is NOT declared here and
 * must not be: PostGraphile exposes a range as an OBJECT type, and
 * GraphQLSchemaGenerator emits every declared property as a bare field name in
 * the selection set — a bare `suppressWindow` is a GraphQL validation error, so
 * declaring it would not degrade the model, it would break every fetch it makes.
 * `suppressWindowMinutes` below carries the same information in a scalar.
 *
 * ── NUMERIC COLUMNS ARRIVE AS STRINGS ───────────────────────────────────────
 * `threshold_value` and `observed_value` are Postgres `numeric`, which
 * PostGraphile v5 serialises as a STRING (BigFloat) so no precision is lost in
 * JSON. They are typed String here to match what actually lands, exactly as
 * useAnalytics.js routes every metric figure through its own `toNumber()`
 * rather than trusting the wire type. Coerce at the point of display.
 *
 * ── WHY updatedAt IS SAFE AS THE syncField ──────────────────────────────────
 * PostGraphile v5 only exposes `orderBy` on INDEXED columns and delta-sync
 * orders by the syncField, so an unindexed one makes the model quietly
 * unsyncable rather than loudly broken. `analytics_alert_events_updated_at_idx`
 * (btree on updated_at) is what keeps this legal — confirmed with
 * `\d public.analytics_alert_events` before this line was written.
 */
@ClientModel('analyticsAlertEvents', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'alertId, recipientUserId, companyId, severity',
})
export class AnalyticsAlertEvent extends BaseModel {
  // Read-only: app_user holds SELECT and nothing else. No `paranoid` — there is
  // no deleted_at column, and a firing is not something to un-happen.

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  // ON DELETE RESTRICT — an alert that has ever fired cannot be hard-deleted out
  // from under its own history.
  @Property({ type: String, required: true }) alertId = ''
  // Who this copy is for. Equal to evaluatedAsUserId by CHECK — see the header.
  @Property({ type: String, required: true }) recipientUserId = ''
  @Property({ type: String, required: true }) evaluatedAsUserId = ''
  @Property({ type: String, required: true }) metricKey = ''
  @Property({ type: String }) dimension = /** @type {String|null} */ (null)
  @Property({ type: String }) dimensionValue = /** @type {String|null} */ (null)
  // Which rung of the parent's ladder fired. Also the suppression key, which is
  // why the parent CHECK refuses duplicates within one alert.
  @Property({ type: String, required: true }) bandKey = ''
  // A SNAPSHOT of the band as it stood when it fired. Editing the alert later
  // must not rewrite history, so the event carries its own copy — CHECK asserts
  // band->>'key' = band_key so the two can never disagree.
  @Property({ type: Object }) band = {}
  // 'gt' | 'gte' | 'lt' | 'lte' (CHECK-constrained).
  @Property({ type: String, required: true }) comparator = 'gt'
  // numeric on the wire — a STRING. See the header.
  @Property({ type: String, required: true }) thresholdValue = ''
  // 'info' | 'warning' | 'critical' (CHECK-constrained).
  @Property({ type: String, required: true }) severity = 'info'
  // The period the figure was computed over, as the evaluator named it, plus the
  // resolved dates. Both matter: the token is what the alert asked for, the
  // dates are what it got.
  @Property({ type: String, required: true }) windowToken = ''
  @Property({ type: DateTime }) windowStart = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) windowEnd = /** @type {DateTime} */ (null)
  // The figure. String on the wire — see the header.
  @Property({ type: String, required: true }) observedValue = ''
  @Property({ type: Number, required: true }) suppressWindowMinutes = 1440
  @Property({ type: DateTime, required: true }) firedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
