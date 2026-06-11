import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * FieldRecord — Inspections & Logs immutable record entity.
 *
 * Backs OPERATIONAL_LOG and CONTROLLED_RECORD form submissions. UTILITY
 * templates continue to write to the standalone `records` table; the
 * Inspections & Logs module never touches that one.
 *
 * Edit / amend / void all happen via REST controllers
 * (`POST /v1/services/fieldRecords/...`), not direct SyncEngine save —
 * the server has to write the corresponding FieldRecordRevision and
 * Signature rows atomically. The SyncEngine push of this record is the
 * server-issued payload after the round trip.
 */
@ClientModel('fieldRecords', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'logBookId, submittedByUserId, statusId',
})
export class FieldRecord extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) logBookId = ''
  @Property({ type: Number }) logBookVersion = 1
  @Property({ type: Object }) logBookSchemaSnapshot = {}
  @Property({ type: String }) recordClassification = 'OPERATIONAL_LOG'
  @Property({ type: String }) recordNumber = ''

  @Property({ type: String, required: true }) submittedByUserId = ''
  @Property({ type: String }) submittedVia = 'MAIN_QMS'
  @Property({ type: DateTime, required: true }) submittedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true }) effectiveAt = /** @type {DateTime} */ (null)

  @Property({ type: DateTime }) lockAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) lockReason = ''

  @Property({ type: String }) statusId = 'SUBMITTED'
  @Property({ type: String }) currentRevisionId = ''
  @Property({ type: String }) assignmentInstanceId = ''
  @Property({ type: String }) parentRecordId = ''

  @Property({ type: DateTime }) voidedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) voidedByUserId = ''
  @Property({ type: String }) voidReason = ''

  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
