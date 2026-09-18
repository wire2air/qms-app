import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

// Global (companyId null) canonical standards + tenant custom clones.
@ClientModel('samplingStandards', { primaryKey: 'id', syncField: 'updatedAt' })
export class SamplingStandard extends BaseModel {
  @Property({ type: String, required: true }) id = ''
  @Property({ type: String }) code = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: Number }) revisionYear = /** @type {Number} */ (null)
  @Property({ type: String }) referenceUrl = /** @type {String} */ (null)
  @Property({ type: Boolean }) active = true
  @Property({ type: String }) companyId = /** @type {String} */ (null)
  @Property({ type: String }) clonedFromStandardId = /** @type {String} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
