import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('inspectionResults', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'inspectionLotId',
})
export class InspectionResult extends BaseModel {
  static paranoid = true
  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) inspectionLotId = ''
  @Property({ type: String }) characteristicId = /** @type {String} */ (null)
  @Property({ type: Object }) characteristicSnapshot = /** @type {Object} */ (null)
  @Property({ type: Number }) sampleIndex = 1
  @Property({ type: Number }) valueNumeric = /** @type {Number} */ (null)
  @Property({ type: String }) valueText = /** @type {String} */ (null)
  @Property({ type: Boolean }) valueBool = /** @type {Boolean} */ (null)
  @Property({ type: Array }) attachments = /** @type {Array} */ ([])
  @Property({ type: String }) equipmentId = /** @type {String} */ (null)
  @Property({ type: String }) outcome = /** @type {String} */ (null)
  @Property({ type: String }) recordedBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) recordedAt = null
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
