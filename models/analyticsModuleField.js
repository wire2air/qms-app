import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AnalyticsModuleField — the vocabulary a custom metric may be built from.
 *
 * Read-only reference data: one row per (module, source table, column) that a
 * tenant is allowed to filter or group by. `database/rls.sql` grants app_user
 * SELECT and nothing more, and the reason is stronger than convention — every
 * identifier the compiler puts through format()/%I comes from a row in this
 * table, so a writable whitelist would not be one.
 *
 * ── WHY IT IS SYNCED RATHER THAN QUERIED ────────────────────────────────────
 * The analytics read exception (CLAUDE.md rule #4) covers server-computed
 * aggregates with no key and no sync event. None of that applies here: this is
 * small, static, keyed reference data, exactly like document_statuses. It got a
 * surrogate `id` in 20260828160000 precisely so it could be modelled — the
 * natural key (module_id, source_table, column_name) is still UNIQUE.
 *
 * ── THE FIELDS THAT ARE NOT OBVIOUS ─────────────────────────────────────────
 * `filterKey` is the FRONTEND query parameter a drill-through uses, not the
 * column name. The two differ often enough to matter and a wrong one produces a
 * list filtered on nothing — which is exactly how the NC and CAPA open-backlog
 * drills came to land on a status that does not exist.
 *
 * `scopeRole` marks which field IS the site / department / owner for its table.
 * It cannot be inferred from the name: documents calls its owner `user_id`.
 *
 * `lookupTable` is the FK target a label resolves through — the same table
 * analytics_dimension_label_table() would find. Null where a column has no FK
 * (nonconformances.priority_id, measured), and the builder then offers free
 * entry instead of a picker.
 */
@ClientModel('analyticsModuleFields', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'moduleId, sourceTable',
})
export class AnalyticsModuleField extends BaseModel {
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) moduleId = ''
  @Property({ type: String, required: true }) sourceTable = ''
  @Property({ type: String, required: true }) columnName = ''
  @Property({ type: String, required: true }) label = ''
  // 'enum' | 'uuid' | 'date' | 'number' | 'text' | 'bool'
  @Property({ type: String, required: true }) kind = ''
  @Property({ type: String }) lookupTable = /** @type {String|null} */ (null)
  @Property({ type: String }) filterKey = /** @type {String|null} */ (null)
  // 'site' | 'department' | 'owner' | null
  @Property({ type: String }) scopeRole = /** @type {String|null} */ (null)
  @Property({ type: Boolean }) groupable = true
  @Property({ type: Boolean }) filterable = true
  @Property({ type: Number }) displayOrder = 0
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
