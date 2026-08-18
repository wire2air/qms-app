import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AnalyticsWidget — ONE QUESTION on a dashboard.
 *
 * Every column here is part of the question: which metric, split by what, over
 * which period, compared against what, filtered how. There is deliberately no
 * column that could hold an answer, and none may be added — the security model
 * of a shared dashboard rests on it. Two people opening the same board must each
 * see their own scope, and the only way to guarantee that is for the stored row
 * to contain no numbers at all, so that rendering it is necessarily a fresh
 * computation as the current viewer.
 *
 * `periodToken` is a RELATIVE token ('last_12_months'), never resolved dates —
 * see `src/utils/analyticsPeriods.js`, which is the client half of that contract
 * and is the reason the builder's period control is a select rather than a date
 * picker. `filters` is likewise part of the question: predicate values only,
 * never a cached label or a resolved count.
 *
 * `viz` is CHECK-constrained to eleven values; which of them are MEANINGFUL for
 * a given metric is decided by `src/utils/analyticsViz.js`, not by this model.
 *
 * Visibility is inherited from the parent dashboard by correlation (RLS calls
 * `can_read_analytics_dashboard()`), so this table carries no visibility column
 * and there is exactly one definition of who may see a board.
 */
@ClientModel('analyticsWidgets', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'dashboardId, companyId',
})
export class AnalyticsWidget extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.createdBy) this.createdBy = currentSession.value?.id || null
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) dashboardId = ''
  // FK to analytics_metrics, so a widget cannot outlive the metric it asks
  // about — a dangling key would render as a permanently empty tile.
  @Property({ type: String, required: true }) metricKey = ''
  // Optional override; the catalog's own metric name is the default at render.
  @Property({ type: String }) title = /** @type {String|null} */ (null)
  @Property({ type: String, required: true }) viz = 'kpi'
  // Addressed by the dimension's declared KEY, never a positional slot.
  @Property({ type: String }) dimension = /** @type {String|null} */ (null)
  // Relative token only. NEVER resolved dates — see the header.
  @Property({ type: String }) periodToken = /** @type {String|null} */ (null)
  @Property({ type: String }) compare = /** @type {String|null} */ (null)
  @Property({ type: Object }) filters = {}
  // Dense 0-based ordering within the dashboard; the drag layout renumbers it.
  @Property({ type: Number, required: true }) position = 0
  @Property({ type: String }) createdBy = /** @type {String|null} */ (null)
  @Property({ type: String }) updatedBy = /** @type {String|null} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
