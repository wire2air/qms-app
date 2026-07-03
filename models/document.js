import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('documents', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'docNumber',
  schemaVersion: 5,
})
export class Document extends BaseModel {
  static paranoid = true // Enable soft deletes using deletedAt field

  constructor(...args) {
    super(...args)
    // Auto-assign companyId and userId from current session on creation
    if (!this.companyId) {
      this.companyId = currentSession.value?.companyId || ''
    }

    if (!this.userId) {
      this.userId = currentSession.value?.userId || ''
    }

    // Author = originator (the creator). Owner is `userId` and can be set to a
    // different user via the create payload; the author always defaults to the
    // current user. Null (not '') so the nullable-UUID GraphQL input accepts it.
    if (!this.authorId) {
      this.authorId = currentSession.value?.userId || null
    }

    if (!this.id) {
      this.id = crypto.randomUUID()
    }
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  // Assigned on first submit-for-review (deferred from create), so a draft
  // deleted before submission never consumes a sequence number. Null while draft.
  @Property({ type: String }) docNumber = null
  @Property({ type: String, required: true }) title = ''
  @Property({ type: String }) departmentId = ''
  // Document Type is no longer captured in the UI; kept nullable for legacy rows.
  @Property({ type: String }) documentTypeId = null
  @Property({ type: String }) documentTemplateId = ''
  @Property({ type: String, required: true }) userId = ''
  // Owner = userId (accountable); author = originator (creator, reassignable).
  @Property({ type: String }) authorId = /** @type {String|null} */ (null)
  @Property({ type: String, required: true }) siteId = ''
  @Property({ type: String }) statusId = 'DRAFT'
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) workflowVersionId = ''
  @Property({ type: String, required: true }) prefix = ''
  // Nullable UUID FK to the RelatedStandard lookup — default null (not '').
  @Property({ type: String }) relatedStandardId = null
  @Property({ type: Number, required: true }) periodicReviewMonths = 12
  @Property({ type: Boolean }) autoEffectiveOnApproval = true
  // Periodic review (ISO 9001 / 13485 — confirm doc still valid every N months).
  // FK columns default to null, NOT empty string — GraphQL rejects '' for
  // nullable UUID inputs ("Invalid UUID, expected 32 hexadecimal characters").
  @Property({ type: DateTime }) lastReviewedAt = null
  @Property({ type: String }) lastReviewedBy = /** @type {String|null} */ (null)
  // Whole-document obsoletion (regulatory withdrawal, scope removed, etc.).
  @Property({ type: DateTime }) obsoletedAt = null
  @Property({ type: String }) obsoletedBy = /** @type {String|null} */ (null)
  @Property({ type: String }) obsoletionReason = /** @type {String|null} */ (null)
  @Property({ type: Object }) trainingConfig = null
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
}
