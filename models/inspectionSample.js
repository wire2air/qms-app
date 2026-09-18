import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * InspectionSample — a single collected sample unit on an inspection lot
 * (in-process / IPQC progressive collection). Records when it was collected +
 * by whom. Test results are keyed by InspectionResult.sampleIndex === sampleNo.
 */
@ClientModel('inspectionSamples', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'inspectionLotId',
})
export class InspectionSample extends BaseModel {
  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) inspectionLotId = ''
  @Property({ type: Number, required: true }) sampleNo = 0
  @Property({ type: String }) batchId = /** @type {String} */ (null)
  @Property({ type: String }) shiftId = /** @type {String} */ (null)
  @Property({ type: DateTime }) collectedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) collectedBy = /** @type {String} */ (null)
  @Property({ type: String }) notes = /** @type {String} */ (null)
  @Property({ type: Array }) attachments = /** @type {Array} */ ([])
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
