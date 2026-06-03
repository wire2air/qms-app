import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('customerComplaints', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId',
  schemaVersion: 1,
})
export class CustomerComplaint extends BaseModel {
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
  @Property({ type: String }) complaintNumber = ''
  @Property({ type: String, required: true }) subject = ''
  @Property({ type: String }) description = ''
  @Property({ type: String }) statusId = 'NEW'
  @Property({ type: String }) priorityId = 'MEDIUM'
  @Property({ type: String, required: true }) sourceId = 'WEB'
  @Property({ type: String }) customerName = ''
  @Property({ type: String }) customerEmail = ''
  @Property({ type: String }) customerUserId = null
  @Property({ type: String }) assignedToUserId = null
  @Property({ type: DateTime }) assignedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) inboundMessageId = ''
  @Property({ type: String }) productId = null
  @Property({ type: String }) supplierId = null
  @Property({ type: DateTime }) resolvedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) closedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) visitorToken = null
  @Property({ type: String }) createdBy = ''
  @Property({ type: String }) updatedBy = ''
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
}
