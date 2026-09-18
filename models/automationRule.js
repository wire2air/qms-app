import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AutomationRule — company-level condition-based notification/automation rule.
 * Managed under Settings → Automation Rules via the syncEngine (useLiveMutation).
 * The worker evaluates these on the audit-event chain.
 */
@ClientModel('automationRules', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, objectType',
})
export class AutomationRule extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.createdBy) this.createdBy = currentSession.value?.userId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String, required: true }) objectType = ''
  @Property({ type: String, required: true }) trigger = 'CREATED'
  @Property({ type: Object }) conditionTree = {}
  @Property({ type: Array }) actions = []
  @Property({ type: Array }) siteIds = []
  @Property({ type: Array }) departmentIds = []
  @Property({ type: Boolean }) isActive = true
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
