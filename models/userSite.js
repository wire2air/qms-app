import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * UserSite — a user's ADDITIONAL site assignments.
 *
 * `User.siteId` remains THE primary site. This pivot holds the extra sites a
 * user is responsible for; effective access is the union of the two, and the
 * `site` permission scope matches against that whole set.
 *
 * Writes are gated server-side by RLS to user-admins only, and never to the
 * row's own user — assigning yourself a site would widen your own site-scoped
 * reach. Creating one of these from the client is an authority change, not a
 * preference; the UI gates on `user_management:update` to match.
 */
@ClientModel('userSites', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'userId, siteId',
})
export class UserSite extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) userId = ''
  @Property({ type: String, required: true }) siteId = ''
  // Nullable UUID FK — null, not '', or PostGraphile rejects "" as an invalid
  // UUID on create.
  @Property({ type: String }) createdBy = null

  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
