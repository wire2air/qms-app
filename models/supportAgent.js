import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * Support Desk agent — spec §2.2. Presence (manualStatus / lastSeenAt) is the
 * agent's own; the effective "available" answer is server-side
 * (support_agent_available) and arrives via /supportDesk/agents.
 */
@ClientModel('supportAgents', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, userId',
  schemaVersion: 1,
})
export class SupportAgent extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) userId = ''
  // AGENT | LEAD
  @Property({ type: String }) role = 'AGENT'
  // ONLINE | AWAY | OFFLINE
  @Property({ type: String }) manualStatus = 'OFFLINE'
  @Property({ type: DateTime }) statusChangedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) statusNote = /** @type {String} */ (null)
  @Property({ type: Number }) maxConcurrentChats = 3
  @Property({ type: Object }) schedule = /** @type {Object} */ (null)
  @Property({ type: String }) timezone = /** @type {String} */ (null)
  @Property({ type: DateTime }) lastSeenAt = /** @type {DateTime} */ (null)
  // INSTANT | DIGEST | NONE
  @Property({ type: String }) notifyMode = 'INSTANT'
  @Property({ type: String }) signatureHtml = /** @type {String} */ (null)
  @Property({ type: Object }) notificationPrefs = /** @type {Object} */ ({})
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: String }) updatedBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
