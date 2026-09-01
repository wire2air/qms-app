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
  // QC-F6 — the disposal facts are server-owned. They move only through
  // POST /v1/services/qcInspection/retainSamples/:id/dispose, which verifies a
  // PIN, writes a Part 11 `signatures` row (QC-F5) and mints a DISPOSED custody
  // event. `enforce_retain_sample_lifecycle` refuses any untrusted write to them
  // with SQLSTATE QMSRS, so without excludeFromGraphQL an inline autosave that
  // merely touched one of these would surface a hard 500 rather than being
  // dropped client-side. The trigger is the real gate; this keeps the client
  // honest about it, matching models/inspectionLot.js.
  // RETAINED | DISPOSED — due/overdue are derived from retainUntil.
  @Property({ type: String, excludeFromGraphQL: ['update'] }) statusId = 'RETAINED'
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) disposedAt =
    /** @type {DateTime} */ (null)
  @Property({ type: String, excludeFromGraphQL: ['update'] }) disposedById = /** @type {String} */ (
    null
  )
  @Property({ type: String, excludeFromGraphQL: ['update'] }) disposalMethod =
    /** @type {String} */ (null)
  @Property({ type: String, excludeFromGraphQL: ['update'] }) disposalNotes =
    /** @type {String} */ (null)
  @Property({ type: String }) notes = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true }) createdAt = null
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true }) updatedAt = null
}
