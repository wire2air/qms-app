import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/** A knowledge base collection (category / section; a tree by parentId). Writes: /v1/services/kb. */
@ClientModel('kbCollections', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'kbId',
  schemaVersion: 1,
})
export class KbCollection extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) kbId = ''
  @Property({ type: String }) parentId = /** @type {String} */ (null)
  @Property({ type: String, required: true }) slug = ''
  @Property({ type: String, required: true }) title = ''
  @Property({ type: String }) description = /** @type {String} */ (null)
  @Property({ type: String }) icon = /** @type {String} */ (null)
  @Property({ type: Number }) position = 0
  @Property({ type: String }) audience = 'PUBLIC'
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: String }) updatedBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
