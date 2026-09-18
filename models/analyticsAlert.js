import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AnalyticsAlert — a standing THRESHOLD on a metric, plus who to tell.
 *
 * ── WHY THIS IS ON THE SYNCENGINE WHEN THE REST OF ANALYTICS IS NOT ─────────
 * CLAUDE.md rule #4 names it: metric values, series and breakdowns are
 * server-computed aggregates and stay off the SyncEngine, but "anything that
 * genuinely IS a record — saved dashboards, report definitions, alerts — stays
 * on the SyncEngine like everything else." This is the alerts half of that
 * sentence.
 *
 * It qualifies for the same structural reason the other two do: an alert stores
 * the QUESTION ("open CAPAs above 20, for this site") and never an answer. The
 * only place an answer is ever written down is AnalyticsAlertEvent, which
 * records what one named person's scope actually returned at one instant — see
 * that model's header for why that is a different kind of row with different
 * rules.
 *
 * ── bands IS AN ESCALATION LADDER, AND IT IS CHECK-VALIDATED ────────────────
 * jsonb array, 1–10 entries, each `{ key, comparator, threshold, severity,
 * recipients? }` where comparator ∈ gt|gte|lt|lte, threshold is a JSON NUMBER,
 * and severity ∈ info|warning|critical (`analytics_alert_bands_valid`). `key` is
 * the SUPPRESSION key and must be unique within the ladder — two bands sharing
 * one key would share one suppression window, and one of them would silently
 * stop firing. An unknown comparator is rejected at INSERT rather than
 * interpreted at evaluation time, so the evaluator never has to fail open.
 *
 * ── recipients IS uuid[], NOT THE SCHEDULES SHAPE ───────────────────────────
 * Deliberately unlike `analytics_report_schedules.recipients` (jsonb
 * `{type,id}` references that expand at send time). Here it is a plain Postgres
 * `uuid[]` of USER ids, and `analytics_alert_recipients(recipients, bands)`
 * unions it with any per-band `recipients` array to answer "who does this alert
 * reach". That union is not cosmetic: the SELECT policy uses it to let a
 * recipient see the alert that names them, and the INSERT/UPDATE WITH CHECK
 * uses it to let somebody without `:manage` create an alert ONLY for themselves.
 * Editing either field changes who may see the row.
 *
 * ── WHAT app_user MAY DO: FULL CRUD ─────────────────────────────────────────
 * Measured on app-db: `app_user=arwd/postgres` — SELECT, INSERT, UPDATE and
 * DELETE, the only one of the four Phase 8 tables with a real DELETE grant, and
 * it has a matching DELETE policy (owner, company owner, or `:manage`). So
 * `paranoid` is true because the table HAS a `deleted_at` column and the rest of
 * the codebase soft-deletes; the DELETE grant exists for the hard case.
 * `analytics_alert_events.alert_id` is ON DELETE RESTRICT, so a hard delete of
 * an alert that has ever fired will be refused by the FK — soft delete is the
 * path that always works, which is what `delete()` does here.
 *
 * ── WHY updatedAt IS SAFE AS THE syncField ──────────────────────────────────
 * PostGraphile v5 only exposes `orderBy` on INDEXED columns and delta-sync
 * orders by the syncField, so an unindexed one makes the model quietly
 * unsyncable rather than loudly broken. `analytics_alerts_updated_at_idx` (btree
 * on updated_at) is what keeps this legal — confirmed with
 * `\d public.analytics_alerts` before this line was written.
 */
@ClientModel('analyticsAlerts', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, ownerId, metricKey, isActive',
})
export class AnalyticsAlert extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    // RLS pins owner_id to the caller on INSERT, so anything else here would be
    // rejected rather than silently reassigned. Set it to match.
    if (!this.ownerId) this.ownerId = currentSession.value?.id || ''
    if (!this.createdBy) this.createdBy = currentSession.value?.id || null
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) ownerId = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = /** @type {String|null} */ (null)
  // FK to analytics_metrics, so an alert cannot outlive the metric it watches —
  // a dangling key would be a threshold that can never be evaluated and never
  // reports that it isn't.
  @Property({ type: String, required: true }) metricKey = ''
  // Optional narrowing: watch one slice rather than the whole metric.
  // dimensionValue without dimension is refused by CHECK.
  @Property({ type: String }) dimension = /** @type {String|null} */ (null)
  @Property({ type: String }) dimensionValue = /** @type {String|null} */ (null)
  // Predicate values only — part of the question, never a cached label or count.
  @Property({ type: Object }) filters = {}
  // The escalation ladder. See the header for the CHECK-enforced shape.
  @Property({ type: Array }) bands = /** @type {Array<Object>} */ ([])
  // uuid[] of USER ids — unioned with per-band recipients by
  // analytics_alert_recipients(). Not the {type,id} shape schedules use.
  @Property({ type: Array }) recipients = /** @type {Array<String>} */ ([])
  // 1 … 43200 minutes (30 days), CHECK-bounded. How long one (alert, recipient,
  // band, dimension value) stays quiet after firing — enforced server-side by a
  // gist EXCLUDE on analytics_alert_events, not by the evaluator remembering.
  @Property({ type: Number, required: true }) suppressWindowMinutes = 1440
  // Unlike a report schedule, an alert defaults to ON: it notifies people who
  // already hold the data rather than mailing figures out of the system, so
  // there is no export gate to clear first.
  @Property({ type: Boolean, required: true }) isActive = true
  @Property({ type: String }) createdBy = /** @type {String|null} */ (null)
  @Property({ type: String }) updatedBy = /** @type {String|null} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
