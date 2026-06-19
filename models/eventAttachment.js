import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

// A file attached to a quality event (uploaded via /v1/files/upload first).
@ClientModel('eventAttachments', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, qualityEventId',
})
export class EventAttachment extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.uploadedBy) this.uploadedBy = currentSession.value?.userId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) qualityEventId = ''
  @Property({ type: String }) assetId = /** @type {String} */ (null)
  @Property({ type: String }) fileName = ''
  @Property({ type: String }) contentType = ''
  @Property({ type: String }) storagePath = ''
  @Property({ type: String }) uploadedBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
