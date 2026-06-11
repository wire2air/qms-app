import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

// AQL plan cells (sample size + accept/reject) per standard / code-letter / AQL /
// switching state. Global rows (companyId null) are read-only; tenant clones are
// editable.
@ClientModel('samplingPlanTables', { primaryKey: 'id', syncField: 'updatedAt', customIndex: 'standardId' })
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
