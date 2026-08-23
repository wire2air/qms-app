import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * RecordShareLinkView — one row per external view of a shared record.
 *
 * READ-ONLY from the client, like [[RecordShareLink]]: these rows are written
 * by the public share endpoint, which has no user session at all. GraphQL is
 * granted SELECT only.
 *
 * Visibility follows the link, which follows the RECORD: if you can read the NC
 * you can see who has opened it. That makes this the "has anyone actually
 * looked" half of a share's lifecycle — the link row says who was given access,
 * these rows say who used it.
 *
 * `ip` and `userAgent` are captured because an external read of a quality
 * record is exactly the event an audit asks about, but they are shown only on
 * the share's own detail view, never in a list.
 */
@ClientModel('recordShareLinkViews', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, shareLinkId',
})
export class RecordShareLinkView extends BaseModel {
  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) shareLinkId = ''
  @Property({ type: DateTime, required: true }) viewedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) ip = /** @type {String} */ (null)
  @Property({ type: String }) userAgent = /** @type {String} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
