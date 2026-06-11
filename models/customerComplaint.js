import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('customerComplaints', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, statusId, assignedTo',
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
  @Property({ type: String }) priorityId = /** @type {String} */ (null)
  @Property({ type: String }) sourceId = 'WEB'
  @Property({ type: String }) customerName = /** @type {String} */ (null)
  @Property({ type: String }) customerEmail = /** @type {String} */ (null)
  @Property({ type: String }) customerCompany = /** @type {String} */ (null)
  @Property({ type: String }) customerPhone = /** @type {String} */ (null)
  @Property({ type: String }) assignedTo = /** @type {String} */ (null)
  // Email channel the ticket arrived on (null for web/manual tickets).
  @Property({ type: String }) channelId = /** @type {String} */ (null)
  @Property({ type: DateTime }) lastCustomerMessageAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) resolvedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) closedAt = /** @type {DateTime} */ (null)
  // Nullable — email-created tickets have no acting user.
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: String }) updatedBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
