import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * RecordShareLink — external, OTP-verified access to one record for someone
 * with no account.
 *
 * READ-ONLY from the client. Minting and revoking go through REST
 * (/v1/services/recordShareLinks) where the record-scoped `manage_access` check
 * lives; GraphQL is granted SELECT only. A share link is a credential, and the
 * client must not be able to write one.
 *
 * Polymorphic, addressed like tasks are (entityType + entityId), so one surface
 * covers every shareable record kind.
 *
 * Not paranoid: revocation is `revokedAt`, and a withdrawn share stays visible
 * because "this was shared and then withdrawn" is exactly the history an
 * auditor asks about. Soft-deleting it would hide the answer.
 */
@ClientModel('recordShareLinks', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, [entityType+entityId]',
})
export class RecordShareLink extends BaseModel {
  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) entityType = ''
  @Property({ type: String, required: true }) entityId = ''
  @Property({ type: String, required: true }) email = ''
  @Property({ type: DateTime, required: true }) expiresAt = /** @type {DateTime} */ (null)
  /** 'SHARE' (a person) or 'NOTIFICATION' (a rule sent it). */
  @Property({ type: String }) origin = 'SHARE'
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) revokedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) revokedBy = /** @type {String} */ (null)
  /** First successful code. Null means sent but never opened. */
  @Property({ type: DateTime }) verifiedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) lastViewedAt = /** @type {DateTime} */ (null)
  @Property({ type: Number }) viewCount = 0
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
