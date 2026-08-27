import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AnalyticsReport — a saved report DEFINITION.
 *
 * ── WHY THIS IS ON THE SYNCENGINE WHEN THE REST OF ANALYTICS IS NOT ─────────
 * Same reason AnalyticsDashboard is. CLAUDE.md rule #4 keeps metric values,
 * series and breakdowns off the SyncEngine because they are server-computed
 * aggregates — no primary key, no sync event, and scope-dependent, so caching
 * one in a per-company IndexedDB would cross a user boundary. The same rule
 * names the other half explicitly: "anything that genuinely IS a record —
 * saved dashboards, report definitions, alerts — stays on the SyncEngine like
 * everything else."
 *
 * A report definition is that record. It has a primary key, an audit trigger,
 * and a sync broadcast. What it does NOT have, by construction, is a number: it
 * stores which questions to ask and in what order, never the answers, so
 * nothing cached here is scope-dependent and two people opening the same shared
 * report each resolve it as themselves at render time.
 *
 * ── definition IS THE QUESTION SET, NOTHING ELSE ────────────────────────────
 * Sections, the metrics each one asks for, ordering, period tokens — the same
 * contract AnalyticsWidget's columns spell out one question at a time. Never a
 * computed value, a resolved label, or a cached series. The moment a figure
 * lands in here, a shared report starts printing its author's numbers for its
 * readers, silently, because the section still renders.
 *
 * ── reportKey AND is_system ─────────────────────────────────────────────────
 * `reportKey` is the stable identity of a SHIPPED report, unique per company
 * (`analytics_reports_report_key_uniq`), which is how an upgrade re-finds the
 * row it seeded instead of planting a duplicate. Tenant-authored reports leave
 * it null. `isSystem` marks those seeded rows: the DELETE policy refuses them,
 * so the list badges them rather than offering a delete that would 403 — and if
 * one were deleted, the next upgrade would re-seed it and the delete would read
 * as having silently failed.
 *
 * ── WHY updatedAt IS SAFE AS THE syncField ──────────────────────────────────
 * PostGraphile v5 only exposes `orderBy` on INDEXED columns, and delta-sync
 * orders by the syncField — an unindexed one makes the model quietly unsyncable
 * rather than loudly broken. `analytics_reports_updated_at_idx` (btree on
 * updated_at) is the index that keeps this legal; don't repoint syncField at a
 * column without checking `\d public.analytics_reports` first.
 *
 * Write access is owner-or-manage and RLS enforces it — the SELECT policy also
 * resolves visibility server-side, so a private report simply is not in the
 * result rather than being filtered out here.
 */
@ClientModel('analyticsReports', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, ownerId, visibility, reportKey',
})
export class AnalyticsReport extends BaseModel {
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
  // Seeded reports only — the per-company stable identity an upgrade re-finds.
  // Null on anything a tenant authored.
  @Property({ type: String }) reportKey = /** @type {String|null} */ (null)
  // 'private' | 'shared' — CHECK-constrained, the same two states as a
  // dashboard. See VISIBILITY in src/utils/analyticsDashboardAccess.js.
  @Property({ type: String, required: true }) visibility = 'private'
  // The question set. Sections and what each asks for — never an answer.
  @Property({ type: Object }) definition = {}
  // Marks a shipped report. Not deletable by the tenant (RLS), and the list
  // badges it so a provided report is distinguishable from an authored one.
  @Property({ type: Boolean }) isSystem = false
  @Property({ type: String }) createdBy = /** @type {String|null} */ (null)
  @Property({ type: String }) updatedBy = /** @type {String|null} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
