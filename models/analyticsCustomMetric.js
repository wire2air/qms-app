import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AnalyticsCustomMetric — a metric a tenant defined for itself.
 *
 * ── WHY THIS IS A RECORD AND analytics_metrics IS NOT ───────────────────────
 * CLAUDE.md rule #4 keeps metric VALUES off the SyncEngine because they are
 * server-computed aggregates resolved under the caller's scope. This is the
 * other half of that rule: a definition is a record. It has a primary key, an
 * updated_at index, and a sync broadcast, and — like a dashboard — it stores a
 * question and never an answer, so nothing cached here is scope-dependent.
 *
 * The compiled counterpart in `analytics_metrics` is deliberately NOT modelled.
 * Nothing in the app may write it: `database/rls.sql` grants app_user SELECT and
 * nothing else, because its columns are SQL fragments that
 * refresh_analytics_rollup executes as the superuser. The compiler
 * (20260828150000) is the only writer, and it runs as a trigger on this table.
 *
 * ── WHAT `definition` HOLDS ─────────────────────────────────────────────────
 *   {
 *     sourceTable: 'documents',            // what is being counted
 *     timeField:   'created_at',           // which date it is counted by
 *     measure:     { type: 'count' },      // count | countDistinct | sum | avg | ratio
 *     filters:     [{ field, op, values }],
 *     groupBy:     ['status_id', 'site_id']
 *   }
 *
 * Every identifier in it is checked against analytics_module_fields before it
 * reaches SQL, and every value is quote_literal()'d. There is no free text here
 * that becomes syntax — which is the entire reason this table exists rather than
 * a form that writes filter_sql directly.
 *
 * ── THE TWO COLUMNS THIS APP CANNOT WRITE ───────────────────────────────────
 * `compileError` and `compiledAt` carry no setter path: app_user holds no column
 * privilege on either (rls.sql), and the BEFORE trigger overwrites them anyway.
 * They are read-only status, and the builder renders compileError as the reason
 * a save did not produce a usable metric.
 *
 * `isPublished` is writable, but a failed compile clears it server-side — a
 * definition that does not compile is not live, and the compiled row is deleted
 * in the same statement. So the flag can go false without the user touching it.
 */
@ClientModel('analyticsCustomMetrics', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, moduleId, isPublished',
})
export class AnalyticsCustomMetric extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.createdBy) this.createdBy = currentSession.value?.id || null
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) moduleId = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = /** @type {String|null} */ (null)
  @Property({ type: Object }) definition = {}
  @Property({ type: Boolean }) isPublished = false
  // 'higher_is_better' | 'lower_is_better' | 'neutral' — CHECK-constrained, and
  // the same vocabulary a shipped metric uses, so a tile renders a custom
  // metric's trend arrow with no special case.
  @Property({ type: String, required: true }) direction = 'neutral'
  @Property({ type: String, required: true }) grain = 'month'
  // ⚠ READ-ONLY, and `excludeFromGraphQL` is what makes that true on the wire.
  // Without it these are sent on every create and update like any other declared
  // property, and the write fails outright — app_user holds no column privilege
  // on either (rls.sql), so naming them in an INSERT is refused.
  //
  // The error that produces is genuinely misleading and cost two rounds to pin:
  // Postgres answers an ungranted COLUMN with
  //     permission denied for TABLE analytics_custom_metrics   (42501)
  // and grafserv then masks it to "An error occurred (id: …)". So the surface
  // symptom is a table-level permission complaint about a table whose grants are
  // fine, on a mutation whose payload is the actual problem.
  //
  // Same shape as capa.statusId / auditInstance.statusId, which exclude
  // themselves from `update` because a trigger owns the transition. Here the
  // compiler owns both columns, on create as well as update.
  @Property({ type: String, excludeFromGraphQL: ['create', 'update'] })
  compileError = /** @type {String|null} */ (null)
  @Property({ type: DateTime, excludeFromGraphQL: ['create', 'update'] })
  compiledAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) createdBy = /** @type {String|null} */ (null)
  @Property({ type: String }) updatedBy = /** @type {String|null} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
