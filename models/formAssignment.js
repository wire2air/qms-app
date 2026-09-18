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
  customIndex: 'logBookId, active',
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
  @Property({ type: String, required: true }) logBookId = ''

  // Exactly one of these is set — see backend CHECK constraint.
  @Property({ type: Array }) assignedUserIds = /** @type {Array<string>} */ ([])
  // Users and roles are UNIONED — an assignment may name individual users,
  // roles, or both (2026-08-15). At least one is required (DB CHECK).
  @Property({ type: Array }) assignedRoleIds = /** @type {Array<string>} */ ([])

  // { type, cron, timezone, occurrencesPerPeriod, startOffsetMinutes, windowMinutes }
  @Property({ type: Object }) schedule = {}
  @Property({ type: Number }) graceMinutes = 60

  @Property({ type: Boolean }) active = true

  @Property({ type: String }) createdBy = ''

  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
