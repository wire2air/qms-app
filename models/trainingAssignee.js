import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('trainingAssignees', {
  primaryKey: 'id',
  loadStrategy: 'instant',
  syncField: 'updatedAt',
  customIndex: '[trainingInstanceId+userId], [companyId+status], trainingInstanceId',
  schemaVersion: 5,
})
export class TrainingAssignee extends BaseModel {
  static paranoid = false

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
  @Property({ type: String, required: true }) userId = ''
  @Property({ type: String }) status = 'ASSIGNED'
  @Property({ type: Object }) assessmentAnswers = {}
  @Property({ type: Number }) score = null
  @Property({ type: DateTime }) startedAt = null
  @Property({ type: DateTime }) completedAt = null
  @Property({ type: DateTime }) removedAt = null
  @Property({ type: String }) removalReason = null
  @Property({ type: DateTime }) signedAt = null
  @Property({ type: String }) signatureMethod = null
  @Property({ type: Number }) attemptCount = 0
  @Property({ type: Number }) reminderCount = 0
  @Property({ type: DateTime }) lastReminderAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
