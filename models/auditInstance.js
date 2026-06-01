import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AuditInstance — the actual audit being performed. Rides the generic
 * workflow engine for close-out (resourceType 'AuditInstance').
 *
 * requirementSchema is a frozen snapshot of the standard version's
 * requirement list at instance creation — same drift-protection
 * pattern as workflow_instance_steps.formSchema.
 */
@ClientModel('auditInstances', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex:
    'companyId, auditProgramId, supplierId, statusId, leadAuditorUserId, scheduledDate',
})
export class AuditInstance extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.createdBy) this.createdBy = currentSession.value?.userId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String }) auditNumber = ''
  @Property({ type: String }) auditProgramId = ''
  @Property({ type: String }) auditStandardId = ''
  @Property({ type: String }) auditStandardVersionId = ''
  @Property({ type: Object }) requirementSchema = []
  @Property({ type: String, required: true }) programTypeId = ''
  @Property({ type: String, required: true }) statusId = 'DRAFT'
  @Property({ type: DateTime }) scheduledDate = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) startedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) completedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) leadAuditorUserId = ''
  @Property({ type: String }) departmentId = ''
  @Property({ type: String }) siteId = ''
  @Property({ type: String }) supplierId = ''
  @Property({ type: String }) scope = ''
  @Property({ type: String }) objectives = ''
  @Property({ type: String }) workflowInstanceId = ''
  @Property({ type: String }) createdBy = ''
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
