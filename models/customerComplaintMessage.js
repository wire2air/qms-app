import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('customerComplaintMessages', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'complaintId, companyId',
  schemaVersion: 1,
})
export class CustomerComplaintMessage extends BaseModel {
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
  @Property({ type: String, required: true }) complaintId = ''
  // INBOUND = customer message, OUTBOUND = agent reply.
  @Property({ type: String }) direction = 'INBOUND'
  // PUBLIC_REPLY (customer-visible) | INTERNAL_NOTE (agent-only).
  @Property({ type: String }) kind = 'PUBLIC_REPLY'
  @Property({ type: String }) senderUserId = /** @type {String} */ (null)
  @Property({ type: String }) senderName = /** @type {String} */ (null)
  @Property({ type: String }) senderEmail = /** @type {String} */ (null)
  @Property({ type: String }) subject = /** @type {String} */ (null)
  @Property({ type: String }) body = ''
  @Property({ type: String }) bodyHtml = /** @type {String} */ (null)
  @Property({ type: String }) emailMessageId = /** @type {String} */ (null)
  @Property({ type: String }) inReplyTo = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
