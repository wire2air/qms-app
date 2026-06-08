import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AuditEvidence — file uploads attached to an audit. Wraps the
 * existing assets pipeline (Asset model via assetId). Three scope
 * levels via nullable FKs: instance (always), requirement response,
 * finding.
 */
@ClientModel('auditEvidence', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex:
    'companyId, auditInstanceId, auditRequirementResponseId, auditFindingId',
})
export class AuditEvidence extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.uploadedByUserId)
      this.uploadedByUserId = currentSession.value?.userId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) auditInstanceId = ''
  @Property({ type: String }) auditRequirementResponseId = ''
  @Property({ type: String }) auditFindingId = ''
  @Property({ type: String }) auditDocumentRequestId = ''
  @Property({ type: String, required: true }) assetId = ''
  @Property({ type: String }) caption = ''
  @Property({ type: String }) uploadedByUserId = ''
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
