import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('customerComplaintMessages', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'complaintId',
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
  @Property({ type: String, required: true }) complaintId = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) direction = 'OUTBOUND'
  @Property({ type: String }) authorUserId = null
  @Property({ type: String }) authorEmail = ''
  @Property({ type: String }) authorName = ''
  @Property({ type: String, required: true }) body = ''
  @Property({ type: String }) bodyHtml = ''
  @Property({ type: Boolean }) isInternal = false
  @Property({ type: Boolean }) deliveredViaEmail = false
  @Property({ type: String }) inboundMessageId = ''
  @Property({ type: String }) inReplyTo = ''
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
}
