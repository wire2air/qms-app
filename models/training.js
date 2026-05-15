import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('trainings', {
  primaryKey: 'id',
  loadStrategy: 'instant',
  syncField: 'updatedAt',
  customIndex: 'companyId, sourceDocumentId',
  schemaVersion: 4,
})
export class Training extends BaseModel {
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
  @Property({ type: String, required: true }) title = ''
  @Property({ type: String }) description = null
  @Property({ type: String }) instructions = null
  @Property({ type: Number }) completionDueDays = null
  @Property({ type: Number }) passingScore = 70
  @Property({ type: Number }) maxAttempts = 1
  @Property({ type: Boolean }) requireManagerVerification = true
  @Property({ type: String }) sourceDocumentId = null
  @Property({ type: String }) managerId = null
  @Property({ type: Array }) assessment = null
  @Property({ type: String }) status = 'DRAFT'
  @Property({ type: String }) createdBy = null
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
