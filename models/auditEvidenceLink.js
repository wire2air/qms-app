import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AuditEvidenceLink — polymorphic link to existing records used as
 * evidence on an audit. entity_type values gated by the BE CHECK
 * constraint to: Document / DocumentVersion / FieldRecord / Capa /
 * Nonconformance / ChangeRequest / TrainingInstance / LogBookVersion /
 * SupplierAsset.
 *
 * Avoids re-uploading proof already in the system — an auditor points
 * at the existing record by id.
 */
@ClientModel('auditEvidenceLinks', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex:
    'companyId, auditInstanceId, auditFindingId, [entityType+entityId]',
})
export class AuditEvidenceLink extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.linkedByUserId) this.linkedByUserId = currentSession.value?.userId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) auditInstanceId = ''
  @Property({ type: String }) auditRequirementResponseId = ''
  @Property({ type: String }) auditFindingId = ''
  @Property({ type: String, required: true }) entityType = ''
  @Property({ type: String, required: true }) entityId = ''
  @Property({ type: String }) caption = ''
  @Property({ type: String }) linkedByUserId = ''
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
