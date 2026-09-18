import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AuditTeamMember — per-instance auditor assignment. role LEAD or
 * TEAM. Used by audit_instances' SELECT RLS so participating auditors
 * can see the audit even without the global audits:read permission.
 */
@ClientModel('auditTeamMembers', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, auditInstanceId, userId, [auditInstanceId+userId]',
})
export class AuditTeamMember extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) auditInstanceId = ''
  @Property({ type: String, required: true }) userId = ''
  @Property({ type: String, required: true }) roleOnAudit = 'TEAM'
  @Property({ type: DateTime }) joinedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
