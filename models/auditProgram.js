import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AuditProgram — recurring schedule definition. Drives the daily
 * worker generate_due_audit_instances which materialises an
 * AuditInstance when the program hits its frequency window.
 */
@ClientModel('auditPrograms', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, supplierId, nextDueDate',
})
export class AuditProgram extends BaseModel {
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
  @Property({ type: String }) description = ''
  @Property({ type: String, required: true }) programTypeId = ''
  @Property({ type: String }) auditStandardId = ''
  @Property({ type: String, required: true }) frequencyId = ''
  @Property({ type: Number }) daysInterval = null
  @Property({ type: String }) cronExpression = ''
  @Property({ type: DateTime }) nextDueDate = /** @type {DateTime} */ (null)
  @Property({ type: String }) managerUserId = ''
  @Property({ type: String }) departmentId = ''
  @Property({ type: String }) siteId = ''
  @Property({ type: String }) supplierId = ''
  @Property({ type: Boolean }) active = true
  @Property({ type: String }) createdBy = ''
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
