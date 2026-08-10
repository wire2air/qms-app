import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * LogBookReviewer — an additional authorized reviewer for a log book's ENTRY
 * review. Exactly one of userId / roleId per row. The book's supervisor is
 * always a reviewer in addition to these. Drives the review queue + the
 * approve/reject gate; site-gating is applied on top.
 */
@ClientModel('logBookReviewers', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'logBookId, userId, roleId',
})
export class LogBookReviewer extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.createdBy) this.createdBy = currentSession.value?.userId || null
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) logBookId = ''
  @Property({ type: String }) userId = null
  @Property({ type: String }) roleId = null
  @Property({ type: String }) createdBy = null

  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
