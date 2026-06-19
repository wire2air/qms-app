import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * NotificationRule — company DEFAULT cc recipients per entity type (one row each
 * for Nonconformance / Capa / ChangeRequest), managed under Settings →
 * Notifications. The worker merges these with each record's own
 * notify_group_ids / notify_user_ids. cc/FYI only.
 */
@ClientModel('notificationRules', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'entityType',
})
export class NotificationRule extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.createdBy) this.createdBy = currentSession.value?.userId || null
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  // 'Nonconformance' | 'Capa' | 'ChangeRequest'
  @Property({ type: String, required: true }) entityType = ''
  // Default cc recipients: { groupIds: [], userIds: [] }
  @Property({ type: Object }) recipients = /** @type {Object} */ ({})
  @Property({ type: Boolean }) isActive = true
  @Property({ type: String }) createdBy = /** @type {String|null} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
