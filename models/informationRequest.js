import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('informationRequests', {
  primaryKey: 'id',
  loadStrategy: 'instant',
  syncField: 'updatedAt',
  customIndex: '[entityType+entityId], requesterId, recipientId, statusId',
  schemaVersion: 1,
})
export class InformationRequest extends BaseModel {
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
  @Property({ type: String, required: true }) entityType = ''
  @Property({ type: String, required: true }) entityId = ''
  @Property({ type: String, required: true }) requesterId = ''
  @Property({ type: String, required: true }) recipientId = ''
  @Property({ type: String, required: true }) question = ''
  @Property({ type: String }) response = ''
  @Property({ type: String }) statusId = 'OPEN'
  @Property({ type: DateTime }) respondedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) acknowledgedAt = /** @type {DateTime} */ (null)
  @Property({ type: String, required: true }) createdBy = ''
  @Property({ type: String, required: true }) updatedBy = ''
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
}
