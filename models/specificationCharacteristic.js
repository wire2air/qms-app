import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('specificationCharacteristics', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'specificationId',
})
export class SpecificationCharacteristic extends BaseModel {
  static paranoid = true
  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) specificationId = ''
  @Property({ type: String }) code = /** @type {String} */ (null)
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String, required: true }) testType = 'NUMERIC'
  @Property({ type: Number }) targetValue = /** @type {Number} */ (null)
  @Property({ type: Number }) lsl = /** @type {Number} */ (null)
  @Property({ type: Number }) usl = /** @type {Number} */ (null)
  @Property({ type: String }) uom = /** @type {String} */ (null)
  @Property({ type: Boolean }) isCritical = false
  @Property({ type: Number }) sortOrder = 0
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
