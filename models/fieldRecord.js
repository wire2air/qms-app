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

  // `excludeFromGraphQL: ['update']` keeps these out of the generated
  // `updateFieldRecord` mutation entirely (hydration.js `computeUpdatePatch`
  // drops them from every patch), so nothing the client does can carry them.
  // The client half of inspections-logs finding #2: the RLS UPDATE policy
  // admitted the record's own submitter with no permission at all, and a
  // hand-rolled mutation still reaches PostGraphile as `app_user` — only
  // enforce_field_record_lifecycle (20260901160000) actually stops that.
  // Nothing in src/ writes these today; this is what keeps it that way.
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) lockAt = /** @type {DateTime} */ (
    null
  )
  @Property({ type: String, excludeFromGraphQL: ['update'] }) lockReason = ''

  @Property({ type: String, excludeFromGraphQL: ['update'] }) statusId = 'SUBMITTED'
  @Property({ type: String, excludeFromGraphQL: ['update'] }) currentRevisionId = ''
  @Property({ type: String }) assignmentInstanceId = ''
  @Property({ type: String }) parentRecordId = ''

  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) voidedAt = /** @type {DateTime} */ (
    null
  )
  @Property({ type: String, excludeFromGraphQL: ['update'] }) voidedByUserId = ''
  @Property({ type: String, excludeFromGraphQL: ['update'] }) voidReason = ''

  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) deletedAt =
    /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
