import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AnalyticsReportRun — the EVIDENCE that a schedule fired, one row per firing.
 *
 * ── WHY THIS TABLE EXISTS AT ALL: graphile-worker DELETES SUCCESSFUL JOBS ───
 * The obvious objection is that the queue already knows. It does not.
 * graphile-worker removes a job row the moment it succeeds — that is the design,
 * and it is why the queue stays small — so the only jobs still visible in
 * `graphile_worker` are the ones that FAILED and have not yet exhausted their
 * retries. Reporting from the queue therefore reports on nothing but failures,
 * and on those only until they are cleaned up.
 *
 * "We emailed the Q3 audit summary to these six people on 12 August" is a claim
 * a regulator or a customer audit will eventually ask us to evidence, and by
 * then the successful job that would have proved it has been gone for months.
 * This is the only surface where a successful delivery is provable, which is why
 * the schedules tab shows it rather than a queue status.
 *
 * It is also the only place Phase 8's exit criterion is OBSERVABLE: "a recipient
 * who loses access stops receiving on the next run" is invisible in an email
 * that does not arrive — it is visible as `deniedCount` rising while
 * `deliveredCount` falls. Show both, always, or the criterion is unverifiable
 * from the UI.
 *
 * ── APPEND-ONLY, AND THAT IS ENFORCED BY GRANT AS WELL AS POLICY ────────────
 * Measured on app-db: `app_user=ar/postgres` — SELECT and INSERT, nothing more.
 * There is no UPDATE policy and no DELETE policy, and neither is granted; the
 * missing policy alone already denies, but the missing grant states the intent
 * where a reader looks first. A log a user can edit is not evidence.
 *
 * So this model is READ-ONLY from the client, and deliberately carries no
 * `paranoid` flag (there is no `deleted_at` column to soft-delete into).
 * `delete()` and `save()` inherit from BaseModel and would 403 — never draw a
 * control that calls either. In practice every row here is written by
 * `run_report_schedules` on the worker's superuser connection, which bypasses
 * all of this: the migration notes that a writer holding only app_user could
 * INSERT a row and then never come back to stamp `finished_at`.
 *
 * ── WHY updatedAt IS SAFE AS THE syncField ──────────────────────────────────
 * PostGraphile v5 only exposes `orderBy` on INDEXED columns and delta-sync
 * orders by the syncField, so an unindexed one makes the model quietly
 * unsyncable rather than loudly broken. `analytics_report_runs_updated_at_idx`
 * (btree on updated_at) is what keeps this legal — confirmed with
 * `\d public.analytics_report_runs` before this line was written.
 *
 * Visibility is inherited from the parent schedule by correlation: both policies
 * call `can_read_analytics_report_schedule(schedule_id)`, so there is exactly one
 * definition of who may see a schedule and its history cannot outrun it.
 */
@ClientModel('analyticsReportRuns', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'scheduleId, reportId, companyId, status',
})
export class AnalyticsReportRun extends BaseModel {
  // No `paranoid`: the table has no deleted_at, and app_user holds neither
  // UPDATE nor DELETE. Soft-deleting a piece of evidence is not a thing.

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) scheduleId = ''
  @Property({ type: String, required: true }) reportId = ''
  // The OCCURRENCE this run belongs to — the cron instant it was due, not the
  // instant work started. `analytics_report_runs_occurrence_uniq` is on
  // (schedule_id, scheduled_for), which is what makes a re-queued tick idempotent.
  // Null for a manual run, which has no occurrence.
  @Property({ type: DateTime }) scheduledFor = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true }) startedAt = /** @type {DateTime} */ (null)
  // Null while still RUNNING. A row that has been null for hours is a stall, and
  // that is a fact worth showing rather than smoothing over.
  @Property({ type: DateTime }) finishedAt = /** @type {DateTime} */ (null)
  // 'RUNNING' | 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'SKIPPED' (CHECK-constrained).
  @Property({ type: String, required: true }) status = 'RUNNING'
  // 'SCHEDULE' | 'MANUAL'.
  @Property({ type: String, required: true }) triggerSource = 'SCHEDULE'
  @Property({ type: String }) format = /** @type {String|null} */ (null)
  // recipientCount is everyone the references EXPANDED to; the other three are
  // what happened to them. delivered + denied + failed <= recipient (CHECK), so
  // a shortfall means "still in flight", not a lost person.
  @Property({ type: Number, required: true }) recipientCount = 0
  @Property({ type: Number, required: true }) deliveredCount = 0
  // The exit criterion made visible — see the header.
  @Property({ type: Number, required: true }) deniedCount = 0
  @Property({ type: Number, required: true }) failedCount = 0
  // NOT NULL whenever status = 'FAILED' (CHECK), so a failed run can always say
  // why. Show it verbatim; a generic "Run failed" throws away the only thing
  // that distinguishes a mail outage from a bad cron.
  @Property({ type: String }) error = /** @type {String|null} */ (null)
  @Property({ type: String }) errorCode = /** @type {String|null} */ (null)
  @Property({ type: Number, required: true }) attempt = 1
  // bigint on the wire — PostGraphile v5 serialises int8 as a STRING, so this is
  // deliberately not a Number. It is a support breadcrumb into graphile_worker,
  // never something to do arithmetic on.
  @Property({ type: String }) jobId = /** @type {String|null} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
