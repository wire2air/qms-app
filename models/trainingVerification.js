import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('trainingVerifications', {
  primaryKey: 'id',
  loadStrategy: 'instant',
  syncField: 'updatedAt',
  customIndex: 'trainingInstanceId, trainingAssigneeId, companyId',
  schemaVersion: 1,
})
export class TrainingVerification extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) {
      this.companyId = currentSession.value?.companyId || ''
    }
    if (!this.id) {
      this.id = crypto.randomUUID()
    }
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) trainingInstanceId = ''
  @Property({ type: String, required: true }) trainingAssigneeId = ''
  @Property({ type: String, required: true }) verifiedBy = ''
  @Property({ type: Boolean }) demonstratedUnderstanding = false
  @Property({ type: Boolean }) canPerformIndependently = false
  @Property({ type: Boolean }) practicalObservationCompleted = false
  @Property({ type: Boolean }) retrainingRequired = false
  @Property({ type: String }) outcome = null
  @Property({ type: String }) notes = null
  @Property({ type: DateTime }) signedAt = null
  @Property({ type: String }) signatureMethod = null
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
