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

  // The client half of inspections-logs finding #1 — the severest in the
  // documentation programme. `field_record_revisions` is append-only Part 11
  // evidence, and its RLS UPDATE policy had NO permission check of any kind
  // while the immutability guard covered six of nineteen columns. These four
  // were among the thirteen it did not cover, so a hand-rolled
  // `updateFieldRecordRevision` could rewrite a recorded review outcome, the
  // stated reason for a void, or detach the signature itself. The table is
  // sealed at the DB by enforce_field_record_revision_immutable (20260901140000);
  // these markers stop the mutation being generated in the first place.
  @Property({ type: String, excludeFromGraphQL: ['update'] }) signatureId = ''
  @Property({ type: String, excludeFromGraphQL: ['update'] }) comment = ''
  @Property({ type: String, excludeFromGraphQL: ['update'] }) reviewOutcome = ''

  @Property({ type: Object, excludeFromGraphQL: ['update'] }) diffFromPrevious = null
  @Property({ type: String, excludeFromGraphQL: ['update'] }) voidReason = ''

  @Property({ type: String }) ipAddress = ''
  @Property({ type: String }) userAgent = ''

  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
