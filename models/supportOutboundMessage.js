import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * Outbound (proactive) chat message — Support Desk Phase C. Read via the sync
 * engine; WRITES go through /v1/services/supportDesk/outbound (state changes,
 * rule validation and stats live server-side).
 */
@ClientModel('supportOutboundMessages', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'brandId',
  schemaVersion: 1,
})
export class SupportOutboundMessage extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) brandId = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) state = 'DRAFT'
  @Property({ type: String }) fromUserId = /** @type {String} */ (null)
  @Property({ type: String }) assignRepliesToUserId = /** @type {String} */ (null)
  @Property({ type: String }) contentHtml = ''
  @Property({ type: String }) contentText = ''
  @Property({ type: String }) replyType = 'TEXT'
  @Property({ type: String }) sentAs = 'SNIPPET'
  @Property({ type: Object }) rules = /** @type {Object} */ ({})
  @Property({ type: String }) frequency = 'ONCE'
  @Property({ type: DateTime }) startsAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) endsAt = /** @type {DateTime} */ (null)
  @Property({ type: Number }) statsSent = 0
  @Property({ type: Number }) statsOpened = 0
  @Property({ type: Number }) statsReplied = 0
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: String }) updatedBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
