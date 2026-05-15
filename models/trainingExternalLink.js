import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('trainingExternalLinks', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'trainingId',
  loadStrategy: 'instant',
  schemaVersion: 2,
})
export class TrainingExternalLink extends BaseModel {
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
  @Property({ type: String }) title = ''
  @Property({ type: String }) url = ''
  @Property({ type: String }) type = 'web'
  @Property({ type: Number }) displayOrder = 0
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
