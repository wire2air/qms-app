import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('trainingInstances', {
  primaryKey: 'id',
  loadStrategy: 'instant',
  syncField: 'updatedAt',
  customIndex: '[trainingId+status], companyId, trainingId',
  schemaVersion: 5,
})
export class TrainingInstance extends BaseModel {
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
  @Property({ type: String, required: true }) trainingId = ''
  @Property({ type: String }) status = 'ACTIVE'
  @Property({ type: DateTime }) dueDate = null
  @Property({ type: Object }) snapshot = {}
  @Property({ type: String }) createdBy = null
  @Property({ type: DateTime }) cancelledAt = null
  @Property({ type: String }) cancelReason = null
  @Property({ type: Boolean }) isAdHoc = false
  @Property({ type: Boolean }) isRetraining = false
  @Property({ type: String }) adHocReason = null
  @Property({ type: String }) sourceType = null
  @Property({ type: String }) sourceId = null
  @Property({ type: String }) managerId = null
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
