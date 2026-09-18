import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * InspectionDefect — a defect logged against an inspection lot (per-lot
 * aggregate count for attributes inspection). Each carries a severity snapshot
 * from the Defect Classification Matrix at log time; the lot's verdict tallies
 * these per severity against the sampling plan's accept/reject numbers.
 */
@ClientModel('inspectionDefects', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'inspectionLotId',
})
export class InspectionDefect extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) inspectionLotId = ''
  @Property({ type: String }) defectCatalogId = /** @type {String} */ (null)
  @Property({ type: String }) code = /** @type {String} */ (null)
  @Property({ type: String }) name = /** @type {String} */ (null)
  // CRITICAL | MAJOR | MINOR (snapshot from the matrix at log time)
  @Property({ type: String, required: true }) severity = 'MAJOR'
  @Property({ type: Number }) quantity = 1
  @Property({ type: String }) notes = /** @type {String} */ (null)
  @Property({ type: String }) recordedBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
