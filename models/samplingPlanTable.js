import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

// AQL plan cells (sample size + accept/reject) per standard / code-letter / AQL /
// switching state. Global rows (companyId null) are read-only; tenant clones are
// editable.
// schemaVersion 2: canonical Z1.4 reseed (2026-08-10) hard-deleted and replaced
// every row — bump forces an IDB rebuild so stale pre-fix cells are purged
// (hard deletes have no sync tombstone).
@ClientModel('samplingPlanTables', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'standardId',
  schemaVersion: 2,
})
export class SamplingPlanTable extends BaseModel {
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) standardId = ''
  @Property({ type: String }) companyId = /** @type {String} */ (null)
  @Property({ type: String, required: true }) codeLetter = ''
  @Property({ type: Number, required: true }) aql = 0
  @Property({ type: String, required: true }) severity = ''
  @Property({ type: Number }) sampleSize = /** @type {Number} */ (null)
  @Property({ type: Number }) accept = /** @type {Number} */ (null)
  @Property({ type: Number }) reject = /** @type {Number} */ (null)
  @Property({ type: String }) arrowDirection = /** @type {String} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
