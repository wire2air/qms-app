import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * FieldRecordRevision — one row per state transition on a FieldRecord.
 * Append-only on the server (the RLS policy grants only SELECT + INSERT
 * to app_user); the frontend never mutates a revision.
 *
 *   INITIAL_SUBMIT   — created at submission
 *   USER_EDIT        — submitter edits during the edit window
 *   ADMIN_AMENDMENT  — admin override (comment + signature required)
 *   VOID             — admin void (reason + signature required)
 *   REVIEW_OUTCOME   — reviewer approve / reject / return-for-info
 */
@ClientModel('fieldRecordRevisions', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'fieldRecordId, authorUserId',
})
export class FieldRecordRevision extends BaseModel {
  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) fieldRecordId = ''
  @Property({ type: Number, required: true }) revisionNumber = 1
  @Property({ type: String, required: true }) revisionType = 'INITIAL_SUBMIT'

  @Property({ type: Object }) payload = {}
  @Property({ type: Array }) attachments = /** @type {Array} */ ([])

  @Property({ type: String, required: true }) authorUserId = ''
  @Property({ type: DateTime, required: true }) authoredAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) clientAuthoredAt = /** @type {DateTime} */ (null)

  @Property({ type: String }) signatureId = ''
  @Property({ type: String }) comment = ''
  @Property({ type: String }) reviewOutcome = ''

  @Property({ type: Object }) diffFromPrevious = null
  @Property({ type: String }) voidReason = ''

  @Property({ type: String }) ipAddress = ''
  @Property({ type: String }) userAgent = ''

  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
