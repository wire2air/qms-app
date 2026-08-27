import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AnalyticsInsight — one generated sentence about a metric.
 *
 * ── READ-ONLY, AND NOT BY CONVENTION ────────────────────────────────────────
 * `app_user` holds SELECT and nothing else on `analytics_insights`; the rows are
 * written by the nightly `generate_analytics_insights` worker. There is
 * deliberately no create/update/delete affordance anywhere on this model,
 * because one would be a button that always 403s — and a surface that
 * intermittently refuses the user teaches them to distrust all of it.
 *
 * ── WHY THIS IS ON THE SYNCENGINE WHEN METRIC VALUES ARE NOT ────────────────
 * CLAUDE.md rule #4 carves out metric values, series and breakdowns because they
 * are server-computed aggregates with no primary key and no sync event. An
 * insight is the opposite: a row, with an id, an audit trail and a broadcast.
 *
 * But it is not a dashboard either, and the difference is worth stating: a
 * dashboard stores a QUESTION and never an answer, so caching it is harmless.
 * An insight IS an answer — it carries `value`, `numerator`, `basis_count`, a
 * headline. Caching an answer in a per-company IndexedDB would normally be
 * exactly the leak rule #4 exists to prevent.
 *
 * What makes it safe is that the answer was already resolved FOR ONE NAMED
 * PERSON before it was written. `generated_for_user_id` is the person the worker
 * assumed the identity of; the SELECT policy hands the row to them and nobody
 * else, and the company owner is deliberately not short-circuited. There is no
 * scope left to apply at read time because it was applied before the sentence
 * existed.
 *
 * ── scopeFingerprint IS THE PART THAT LOOKS INERT AND IS NOT ────────────────
 * The policy's last clause is `scope_fingerprint = analytics_scope_fingerprint()`
 * — the row's fingerprint compared to the READER'S CURRENT one. A user whose
 * grants changed this morning sees NONE of their rows until the next nightly
 * run rebuilds them. Stale insights orphan themselves; there is no separate
 * invalidation step for anyone to forget.
 *
 * The cost lands squarely on the UI: that empty list is pixel-identical to a
 * genuinely quiet week and means the opposite thing. It cannot be told apart
 * from this table, because the rows you would count are the rows being hidden —
 * so `public.analytics_insight_staleness()` answers it from above the policy.
 * Any surface rendering insights must call it before showing an empty state.
 */
@ClientModel('analyticsInsights', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, generatedForUserId, ruleId',
})
export class AnalyticsInsight extends BaseModel {
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) generatedForUserId = ''
  // Compared against the reader's CURRENT fingerprint by the SELECT policy.
  @Property({ type: String, required: true }) scopeFingerprint = ''
  @Property({ type: String }) effectiveScope = /** @type {String|null} */ (null)
  @Property({ type: String, uuid: true, required: true }) runId = ''

  // CHECK-constrained to six values. `ruleClass` separates deterministic from
  // statistical; `method` states HOW, and matters most for robust_anomaly, which
  // is a distinct rule id precisely so a reader who sees `seasonal_anomaly`
  // knows the time of year really was accounted for.
  @Property({ type: String, required: true }) ruleId = ''
  @Property({ type: String, required: true }) ruleClass = ''
  @Property({ type: String }) severity = /** @type {String|null} */ (null)
  @Property({ type: String, required: true }) method = ''

  @Property({ type: String, required: true }) metricKey = ''
  @Property({ type: String, required: true }) metricName = ''
  @Property({ type: String }) moduleId = /** @type {String|null} */ (null)
  @Property({ type: String, required: true }) unit = ''
  @Property({ type: String }) direction = /** @type {String|null} */ (null)

  @Property({ type: String, required: true }) periodGrain = ''
  @Property({ type: String, required: true }) periodStart = ''
  @Property({ type: String, required: true }) periodEnd = ''
  @Property({ type: String }) comparisonStart = /** @type {String|null} */ (null)
  @Property({ type: String }) comparisonEnd = /** @type {String|null} */ (null)

  @Property({ type: String }) dimensionKey = /** @type {String|null} */ (null)
  // ⚠ A null here is the GENUINE null segment, never the residual: the generator
  // filters `is_residual` rows out before an insight is built, which is why this
  // table has no `isResidual` column. Do not re-derive that distinction here.
  @Property({ type: String }) dimensionValue = /** @type {String|null} */ (null)
  @Property({ type: String }) dimensionLabel = /** @type {String|null} */ (null)

  @Property({ type: Number }) value = /** @type {Number|null} */ (null)
  @Property({ type: Number }) numerator = /** @type {Number|null} */ (null)
  @Property({ type: Number }) denominator = /** @type {Number|null} */ (null)
  @Property({ type: Number }) comparisonValue = /** @type {Number|null} */ (null)
  @Property({ type: Number }) comparisonNumerator = /** @type {Number|null} */ (null)
  @Property({ type: Number }) comparisonDenominator = /** @type {Number|null} */ (null)
  @Property({ type: Number }) deltaAbs = /** @type {Number|null} */ (null)
  @Property({ type: Number }) deltaPct = /** @type {Number|null} */ (null)

  // What the claim rests on, and the floor it had to clear. Showing basisCount
  // is the difference between an insight and a rumour, so it is not optional
  // decoration on any surface that renders `headline`.
  @Property({ type: Number, required: true }) basisCount = 0
  @Property({ type: Number, required: true }) denominatorFloor = 0
  @Property({ type: Boolean }) isSignificant = false
  @Property({ type: Number }) testStatistic = /** @type {Number|null} */ (null)

  @Property({ type: String, required: true }) headline = ''
  @Property({ type: String, required: true }) detail = ''
  @Property({ type: Object }) evidence = {}

  // Where the reader goes to see the records behind the sentence.
  @Property({ type: String }) drillRoute = /** @type {String|null} */ (null)
  @Property({ type: Object }) drillFilters = {}

  // Stable across runs, so an insight that persists keeps its firstSeenAt rather
  // than looking new every morning.
  @Property({ type: String, required: true }) insightKey = ''
  @Property({ type: DateTime }) metricComputedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) firstSeenAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) computedAt = /** @type {DateTime} */ (null)

  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
