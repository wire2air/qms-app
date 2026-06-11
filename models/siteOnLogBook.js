import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * SiteOnLogBook — pivot between log_books and sites. Replaces
 * SiteOnTemplate for log books only; legacy form_templates still use
 * SiteOnTemplate for UTILITY templates.
 */
@ClientModel('sitesOnLogBooks', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'logBookId, siteId',
})
export class SiteOnLogBook extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) logBookId = ''
  @Property({ type: String, required: true }) siteId = ''

  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
