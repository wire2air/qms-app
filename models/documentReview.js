import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * DocumentReview — one attested periodic-review decision.
 *
 * READ-ONLY from the client: reviews are completed through REST, where the
 * PIN verification and the signature mint live. GraphQL is granted SELECT
 * only, so this model exists to LIST history — the write path is
 * POST /v1/services/documents/:id/review.
 *
 * Kept as history on purpose: the "reviewed, no change required" outcome has
 * nothing else to show for it, and an assessor's question is "show me the
 * review decisions", plural.
 */
@ClientModel('documentReviews', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, documentId',
})
export class DocumentReview extends BaseModel {
  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) documentId = ''
  @Property({ type: String }) taskInstanceId = /** @type {String} */ (null)
  /** NO_CHANGE | REVISION | OBSOLETE */
  @Property({ type: String, required: true }) outcome = ''
  /** Rich text; required server-side for NO_CHANGE. */
  @Property({ type: String }) justification = /** @type {String} */ (null)
  @Property({ type: String, required: true }) reviewedBy = ''
  @Property({ type: DateTime, required: true }) reviewedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) signatureId = /** @type {String} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
