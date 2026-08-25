import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * RecordShareLinkItem — one entry in an Audit Records Package's manifest
 * (which documents/records a package share link exposes). Written through
 * REST only; synced for the auditee Share tab and the Shared Records page.
 */
@ClientModel('recordShareLinkItems', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, recordShareLinkId',
})
export class RecordShareLinkItem extends BaseModel {
  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) recordShareLinkId = ''
  @Property({ type: String, required: true }) entityType = ''
  @Property({ type: String, required: true }) entityId = ''
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
