import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

// A note on a quality event. visibility INTERNAL (quality team) | PUBLIC.
@ClientModel('eventNotes', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, qualityEventId',
})
export class EventNote extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.createdBy) this.createdBy = currentSession.value?.userId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) qualityEventId = ''
  @Property({ type: String, required: true }) body = ''
  @Property({ type: String, required: true }) visibility = 'INTERNAL'
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
