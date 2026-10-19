import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * Website visitor behind a chat ticket (Support Desk). Read-only on the
 * client (the public chat API writes it); the inbox details drawer shows the
 * identity the host site passed (USER / LEAD / VISITOR, attributes, presence).
 */
@ClientModel('supportVisitors', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'brandId',
  schemaVersion: 1,
})
export class SupportVisitor extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) brandId = ''
  @Property({ type: String }) identifiedEmail = /** @type {String} */ (null)
  @Property({ type: String }) identifiedName = /** @type {String} */ (null)
  @Property({ type: String }) externalUserId = /** @type {String} */ (null)
  @Property({ type: String }) externalCompany = /** @type {String} */ (null)
  @Property({ type: String }) visitorKind = 'VISITOR'
  @Property({ type: Object }) attributes = /** @type {Object} */ ({})
  @Property({ type: Boolean }) identityVerified = false
  @Property({ type: String }) customerId = /** @type {String} */ (null)
  @Property({ type: String }) organizationId = /** @type {String} */ (null)
  @Property({ type: String }) lastPageUrl = /** @type {String} */ (null)
  @Property({ type: String }) userAgent = /** @type {String} */ (null)
  @Property({ type: String }) locale = /** @type {String} */ (null)
  @Property({ type: Boolean }) isBlocked = false
  @Property({ type: DateTime }) firstSeenAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) lastSeenAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
