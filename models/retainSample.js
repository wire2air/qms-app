import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

// A retained physical sample (reserve/reference/retention) kept from an
// inspected lot — one record per retained box/pack with a quantity. Created
// via the REST action (RS number minted server-side); edits + disposal are
// action RPCs too, so this model is read-mostly on the FE.
@ClientModel('retainSamples', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'inspectionLotId, statusId',
})
export class RetainSample extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) rsNumber = ''
  @Property({ type: String, required: true }) inspectionLotId = ''
  @Property({ type: String }) inspectionBatchId = /** @type {String} */ (null)
  @Property({ type: String }) productId = /** @type {String} */ (null)
  @Property({ type: String }) lotNumber = /** @type {String} */ (null)
  @Property({ type: String }) batchNumber = /** @type {String} */ (null)
  // RESERVE (re-test stock) | REFERENCE | RETENTION (EU market-pack)
  @Property({ type: String }) sampleType = 'RESERVE'
  @Property({ type: Number }) quantity = /** @type {Number} */ (null)
  @Property({ type: String }) uomId = /** @type {String} */ (null)
  @Property({ type: String }) storageLocationId = /** @type {String} */ (null)
  @Property({ type: String }) position = /** @type {String} */ (null)
  @Property({ type: String }) storageConditions = /** @type {String} */ (null)
  @Property({ type: DateTime }) manufacturingDate = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) expiryDate = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) retainedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) retainedById = /** @type {String} */ (null)
  @Property({ type: DateTime }) retainUntil = /** @type {DateTime} */ (null)
  @Property({ type: String }) sealState = 'SEALED'
  // RETAINED | DISPOSED — due/overdue are derived from retainUntil.
  @Property({ type: String }) statusId = 'RETAINED'
  @Property({ type: DateTime }) disposedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) disposedById = /** @type {String} */ (null)
  @Property({ type: String }) disposalMethod = /** @type {String} */ (null)
  @Property({ type: String }) disposalNotes = /** @type {String} */ (null)
  @Property({ type: String }) notes = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true }) createdAt = null
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true }) updatedAt = null
}
