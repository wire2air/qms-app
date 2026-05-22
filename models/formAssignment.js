import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * FormAssignment — admin-defined plan. CRUD via SyncEngine for admins
 * with the `inspections:assign` permission. The scheduler (server-side
 * worker task) materialises AssignmentInstances from these.
 */
@ClientModel('formAssignments', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'formTemplateId, active',
})
export class FormAssignment extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) formTemplateId = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = ''

  // Exactly one of these is set — see backend CHECK constraint.
  @Property({ type: Array }) assignedUserIds = /** @type {Array<string>} */ ([])
  @Property({ type: String }) assignedRoleId = ''

  @Property({ type: String }) siteId = ''

  // { type, cron, timezone, occurrencesPerPeriod, startOffsetMinutes, windowMinutes }
  @Property({ type: Object }) schedule = {}
  @Property({ type: Number }) graceMinutes = 60

  @Property({ type: DateTime }) effectiveAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) effectiveUntil = /** @type {DateTime} */ (null)

  @Property({ type: Boolean }) active = true

  @Property({ type: String }) createdBy = ''

  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
