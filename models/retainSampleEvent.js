import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

// Chain-of-custody trail rows for a retain sample — service-minted, read-only
// on the FE (rendered as the custody timeline on the detail page).
@ClientModel('retainSampleEvents', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'retainSampleId',
})
export class RetainSampleEvent extends BaseModel {
  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) retainSampleId = ''
  @Property({ type: String, required: true }) eventType = ''
  @Property({ type: String }) actorUserId = /** @type {String} */ (null)
  @Property({ type: Number }) quantityDelta = /** @type {Number} */ (null)
  @Property({ type: String }) fromLocationId = /** @type {String} */ (null)
  @Property({ type: String }) toLocationId = /** @type {String} */ (null)
  @Property({ type: String }) reason = /** @type {String} */ (null)
  @Property({ type: String }) notes = /** @type {String} */ (null)
  @Property({ type: Object }) payload = /** @type {Object} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true }) createdAt = null
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true }) updatedAt = null
}
