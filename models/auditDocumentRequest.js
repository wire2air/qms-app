import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AuditDocumentRequest — a PBC ("Provided By Client") line item on an audit.
 * The auditor lists requested documents; AuditEvidence rows point back via
 * auditDocumentRequestId (or are add-ons with no link). Status is derived
 * from whether any evidence references it.
 */
@ClientModel('auditDocumentRequests', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, auditInstanceId',
})
export class AuditDocumentRequest extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.createdBy) this.createdBy = currentSession.value?.userId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) auditInstanceId = ''
  @Property({ type: String, required: true }) title = ''
  @Property({ type: String }) notes = ''
  @Property({ type: Number }) displayOrder = 1000
  @Property({ type: String }) createdBy = ''
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
}
