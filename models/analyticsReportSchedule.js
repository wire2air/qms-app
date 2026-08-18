import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AnalyticsReportSchedule — a standing instruction to MAIL a saved report.
 *
 * ── WHY THIS IS ON THE SYNCENGINE WHEN THE REST OF ANALYTICS IS NOT ─────────
 * The same carve-out AnalyticsReport and AnalyticsDashboard sit in. CLAUDE.md
 * rule #4 keeps metric values, series and breakdowns off the SyncEngine because
 * they are server-computed aggregates — no primary key, no sync event, and
 * scope-dependent — while stating the other half explicitly: "anything that
 * genuinely IS a record — saved dashboards, report definitions, alerts — stays
 * on the SyncEngine like everything else."
 *
 * A schedule is that kind of record: primary key, audit trigger, and — like the
 * report it points at — NOT ONE NUMBER anywhere in it. It stores when to ask
 * and who to tell, never an answer. `backend/worker/tasks/run_report_schedules.js`
 * is the other half of that: it queues one export job PER RECIPIENT so each
 * person's copy is resolved under their own RLS. A schedule that cached a figure
 * would mail its author's numbers to everybody on the list, and the resulting
 * file would look entirely correct to every one of them.
 *
 * ── recipients ARE REFERENCES, NEVER ADDRESSES ──────────────────────────────
 * jsonb array of `[{ type: 'user'|'team'|'role', id: <uuid> }]` and nothing
 * else: `analytics_report_schedules_recipients_chk` WHITELISTS those two keys,
 * so an email address is not discouraged here, it is UNREPRESENTABLE under any
 * key name. An address is a snapshot of an authorisation decision that keeps
 * asserting itself after the person changes role, leaves, or loses the module;
 * a reference can be re-asked, and is, at every firing. team and role expand at
 * SEND time for the same reason — "the Quality Managers" survives a leaver and
 * a named list does not.
 *
 * The client mirror of those rules lives in
 * `src/utils/analyticsReportScheduleCron.js`; the authority is the CHECK
 * constraint plus `backend/api/schemas/analyticsReportSchedules.js`.
 *
 * ── is_active IS AN EXPORT DECISION, NOT A MANAGE ONE ───────────────────────
 * Both the INSERT and UPDATE policies carry
 * `(is_active = false OR authz.has_permission('reports_dashboards','export'))`.
 * The permission is tested on the RESULTING ROW rather than on the operation,
 * which buys two properties deliberately: an inactive draft can be written by
 * anyone with write access, and ANYONE with write access can always switch a
 * schedule OFF — turning something off must never require a permission. A live
 * schedule mails figures out of the system on a timer with nobody watching, so
 * holding one is an export, and gating it on `manage` would let a manage-only
 * holder mail themselves the very file `request_report_export` refuses them.
 *
 * ── WHAT app_user MAY DO: SELECT, INSERT, UPDATE — AND NO DELETE ────────────
 * Measured on app-db: `app_user=arw/postgres`. There is no DELETE grant and no
 * DELETE policy, on purpose — `analytics_report_runs` cascades from this table
 * and a hard delete would take the delivery evidence with it. So `paranoid` is
 * true and `delete()` becomes an UPDATE that stamps `deletedAt`, which is the
 * one shape the grants allow. `hardDelete()` exists on BaseModel and would 403
 * here; never call it.
 *
 * One trap in that: the UPDATE policy's WITH CHECK still applies to the
 * soft-delete UPDATE, so retiring an ACTIVE schedule without `:export` fails.
 * Clear `isActive` in the same save (see ReportSchedulesTab's retire()).
 *
 * ── WHY updatedAt IS SAFE AS THE syncField ──────────────────────────────────
 * PostGraphile v5 only exposes `orderBy` on INDEXED columns and delta-sync
 * orders by the syncField, so an unindexed one makes the model quietly
 * UNSYNCABLE rather than loudly broken — analytics_dashboards shipped that way
 * and needed migration 20260818000000 to repair it.
 * `analytics_report_schedules_updated_at_idx` (btree on updated_at) is what
 * keeps this legal; it was confirmed with `\d public.analytics_report_schedules`
 * before this line was written, and must be re-confirmed before it is changed.
 */
@ClientModel('analyticsReportSchedules', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, reportId, ownerId, isActive',
})
export class AnalyticsReportSchedule extends BaseModel {
  // No DELETE grant on app_user — soft delete is the only delete this table has.
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
  // CASCADE from analytics_reports: a schedule for a report that no longer
  // exists is a mailer with nothing to mail.
  @Property({ type: String, required: true }) reportId = ''
  // The person ACCOUNTABLE for the send — not "who receives it", and not
  // necessarily the report's owner. A quality manager may schedule somebody
  // else's shared report.
  @Property({ type: String, required: true }) ownerId = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = /** @type {String|null} */ (null)
  // FIVE fields, no seconds. The CHECK proves the shape; only cron-parser on
  // the server can prove it parses. See analyticsReportScheduleCron.js.
  @Property({ type: String, required: true }) cronExpression = '0 8 * * MON'
  // IANA name. A BEFORE trigger validates it against pg_timezone_names and
  // RAISES on an unknown zone — abbreviations like EST are refused because they
  // carry no daylight-saving rule and DST is the entire point of storing one.
  @Property({ type: String, required: true }) timezone = 'UTC'
  // 'pdf' | 'xlsx' — the same two request_report_export accepts, so a schedule
  // cannot ask for a format the exporter would only fail to produce at send time.
  @Property({ type: String, required: true }) format = 'pdf'
  // [{ type: 'user'|'team'|'role', id }] — references, never addresses.
  @Property({ type: Array }) recipients = /** @type {Array<Object>} */ ([])
  // Created OFF. A row appearing in a table must never be the event that starts
  // mailing people; activation is a separate, permissioned act (:export).
  @Property({ type: Boolean, required: true }) isActive = false
  // Both written by the worker, never by the client.
  @Property({ type: DateTime }) lastRunAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) nextRunAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) createdBy = /** @type {String|null} */ (null)
  @Property({ type: String }) updatedBy = /** @type {String|null} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
