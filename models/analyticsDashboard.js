import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AnalyticsDashboard — a saved dashboard DEFINITION.
 *
 * ── WHY THIS IS ON THE SYNCENGINE WHEN THE REST OF ANALYTICS IS NOT ─────────
 * CLAUDE.md rule #4 carves metric values, series and breakdowns out of the
 * SyncEngine because they are server-computed aggregates: no primary key, no
 * sync event, and scope-dependent, so caching one in a per-company IndexedDB
 * would cross a user boundary. The same rule states the other half explicitly —
 * "anything that genuinely IS a record — saved dashboards, report definitions,
 * alerts — stays on the SyncEngine like everything else."
 *
 * This is that. It has a primary key, an audit trigger, and a sync broadcast.
 * What it does NOT have, by construction, is a number: a dashboard stores a
 * question and never an answer, so nothing cached here is scope-dependent and
 * nothing cached here can leak a figure between two viewers of the same shared
 * board. Each of them still resolves the question themselves at render time.
 *
 * ── layout IS GEOMETRY, NOTHING ELSE ────────────────────────────────────────
 * Grid geometry only — column counts, row heights. Never a computed value, a
 * resolved label, or a cached series. The moment a number lands in here, a
 * shared dashboard starts showing its author's figures to its readers, and it
 * does so silently, because the tile still renders.
 *
 * Write access is owner-or-manage and RLS enforces it; see
 * `src/utils/analyticsDashboardAccess.js` for the client-side mirror that
 * decides which buttons to draw.
 */
@ClientModel('analyticsDashboards', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, ownerId, visibility',
})
export class AnalyticsDashboard extends BaseModel {
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
  // 'private' | 'shared' — CHECK-constrained. See VISIBILITY in
  // src/utils/analyticsDashboardAccess.js.
  @Property({ type: String, required: true }) visibility = 'private'
  @Property({ type: Object }) layout = {}
  @Property({ type: String }) persona = /** @type {String|null} */ (null)
  // Marks a seeded persona default. Not deletable by the tenant (RLS), and the
  // list badges it so a shipped board is distinguishable from an authored one.
  @Property({ type: Boolean }) isSystem = false
  @Property({ type: String }) createdBy = /** @type {String|null} */ (null)
  @Property({ type: String }) updatedBy = /** @type {String|null} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
