import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * RecordLink — generic directional lineage between two records
 * (from = upstream cause → to = downstream effect). Polymorphic both ends; the
 * *Type fields name the entity (see src/utils/recordRef.js). Read-only via sync;
 * written server-side by recordLinkService in the creation flows.
 */
@ClientModel('recordLinks', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, [fromType+fromId], [toType+toId]',
})
export class RecordLink extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) fromType = ''
  @Property({ type: String, required: true }) fromId = ''
  @Property({ type: String, required: true }) toType = ''
  @Property({ type: String, required: true }) toId = ''
  @Property({ type: String }) relation = 'CAUSED'
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
