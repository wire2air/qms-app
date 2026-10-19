import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * Support Desk brand — docs/support-desk-live-chat-spec.md §2.1. Read via the
 * sync engine; WRITES go through /v1/services/supportDesk/brands (the
 * publishable key is minted server-side and the default is exclusive).
 */
@ClientModel('supportBrands', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId',
  schemaVersion: 1,
})
export class SupportBrand extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String, required: true }) slug = ''
  @Property({ type: String }) logoAssetId = /** @type {String} */ (null)
  @Property({ type: String }) accentColor = /** @type {String} */ (null)
  @Property({ type: String }) fromName = /** @type {String} */ (null)
  @Property({ type: String }) fromEmail = /** @type {String} */ (null)
  @Property({ type: String }) defaultChannelId = /** @type {String} */ (null)
  @Property({ type: Array }) allowedOrigins = /** @type {string[]} */ ([])
  @Property({ type: String }) publishableKey = ''
  @Property({ type: String }) timezone = 'UTC'
  @Property({ type: Object }) businessHours = /** @type {Object} */ ({})
  @Property({ type: Boolean }) autoAssign = true
  @Property({ type: Boolean }) autoAssignEmail = false
  @Property({ type: Boolean }) requeueChatOnOffline = true
  @Property({ type: String }) fallbackEmail = /** @type {String} */ (null)
  @Property({ type: Number }) unansweredAlertMinutes = 5
  @Property({ type: Object }) settings = /** @type {Object} */ ({})
  @Property({ type: Object }) autoMessages = /** @type {Object} */ ({})
  @Property({ type: Object }) widget = /** @type {Object} */ ({})
  @Property({ type: String }) signatureHtml = /** @type {String} */ (null)
  @Property({ type: Boolean }) isDefault = false
  @Property({ type: String }) stateId = 'ACTIVE'
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: String }) updatedBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
