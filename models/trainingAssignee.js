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
  // The regulated completion record. These fields are the proof of WHO completed
  // WHAT, WHEN, with what score and under whose e-signature, so none of them may
  // ride the generic updateTrainingAssignee mutation — a learner holds an RLS
  // self-predicate (user_id = current_user) on this row and could otherwise
  // forge a VERIFIED, perfect-scored, signed record without sitting the
  // assessment (verified against app-db; see migration 20260728120000). They are
  // written only by the training endpoints (start / submit / verify), which run
  // as trusted server code. The DB trigger is the real backstop; this is the
  // client half, matching changeRequest.js statusId / capa.js / nonconformance.js.
  @Property({ type: String, excludeFromGraphQL: ['update'] }) status = 'ASSIGNED'
  @Property({ type: Object }) assessmentAnswers = {}
  @Property({ type: Number, excludeFromGraphQL: ['update'] }) score = null
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) startedAt = null
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) completedAt = null
  @Property({ type: DateTime }) removedAt = null
  @Property({ type: String }) removalReason = null
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) signedAt = null
  @Property({ type: String, excludeFromGraphQL: ['update'] }) signatureMethod = null
  @Property({ type: Number, excludeFromGraphQL: ['update'] }) attemptCount = 0
  @Property({ type: Number }) reminderCount = 0
  @Property({ type: DateTime }) lastReminderAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
