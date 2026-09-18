import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * InspectionBatch — a production lot (batch#) within a QC inspection. Multiple
 * for in-process (line lot changes across shifts); one for incoming/final.
 * Collected samples belong to a batch; the lot's active_batch_id is current.
 */
@ClientModel('inspectionBatches', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'inspectionLotId',
})
export class InspectionBatch extends BaseModel {
  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) inspectionLotId = ''
  @Property({ type: String }) lotNumber = /** @type {String} */ (null)
  @Property({ type: String }) shiftId = /** @type {String} */ (null)
  @Property({ type: String }) notes = /** @type {String} */ (null)
  // Line clearance (per production lot): schema snapshot + answers + QA release.
  @Property({ type: Array }) lineClearanceSchema = /** @type {Array} */ (null)
  @Property({ type: Object }) lineClearancePayload = /** @type {Object} */ (null)
  @Property({ type: String }) lineClearanceStatus = 'NOT_STARTED'
  @Property({ type: String }) lineClearanceBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) lineClearanceAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) closedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) closedBy = /** @type {String} */ (null)
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true }) createdAt = null
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true }) updatedAt = null
}
