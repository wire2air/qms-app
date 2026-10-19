import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/** Learned spam signals (spec §2.5). Written via /supportDesk/blocklist and spam-learn. */
@ClientModel('supportBlocklists', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId',
  schemaVersion: 1,
})
export class SupportBlocklistEntry extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String }) brandId = /** @type {String} */ (null)
  // EMAIL | DOMAIN | VISITOR | IP_HASH
  @Property({ type: String, required: true }) kind = 'EMAIL'
  @Property({ type: String, required: true }) value = ''
  @Property({ type: String }) reason = /** @type {String} */ (null)
  @Property({ type: String }) learnedFromComplaintId = /** @type {String} */ (null)
  @Property({ type: DateTime }) expiresAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
