import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * FieldRecordFlag — append-only flag-history row on a FieldRecord.
 * Raised by floor users + resolved by supervisors. See backend
 * migration 20260526000300-create-field-record-flags.js for audit
 * rationale.
 */
@ClientModel('fieldRecordFlags', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'fieldRecordId, flaggedByUserId, severity',
})
export class FieldRecordFlag extends BaseModel {
  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) fieldRecordId = ''
  @Property({ type: String, required: true }) flaggedByUserId = ''
  @Property({ type: DateTime, required: true }) flaggedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) severity = 'WARN'
  @Property({ type: String, required: true }) notes = ''
  @Property({ type: Array }) attachmentIds = /** @type {Array<string>} */ ([])

  @Property({ type: DateTime }) resolvedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) resolvedByUserId = ''
  @Property({ type: String }) resolutionNotes = ''

  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
