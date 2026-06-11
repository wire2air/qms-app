import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AuditProgramAuditor — join between AuditProgram and User. role
 * LEAD or TEAM. Defines the auditor pool the daily generator picks
 * from when minting an AuditInstance.
 */
@ClientModel('auditProgramAuditors', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, auditProgramId, [auditProgramId+userId]',
})
export class AuditProgramAuditor extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) auditProgramId = ''
  @Property({ type: String, required: true }) userId = ''
  @Property({ type: String, required: true }) roleOnAudit = 'TEAM'
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
