import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('supplierLocations', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'supplierId',
})
export class SupplierLocation extends BaseModel {
  static paranoid = true
  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) supplierId = ''
  @Property({ type: String }) name = ''
  // PRODUCTION / CORPORATE_OFFICE / WAREHOUSE / TECHNICAL / ENGINEERING / OTHER
  @Property({ type: String }) locationType = ''
  @Property({ type: String }) streetAddress = ''
  @Property({ type: String }) city = ''
  @Property({ type: String }) stateProvince = ''
  @Property({ type: String }) zipPostalCode = ''
  @Property({ type: String }) country = ''
  @Property({ type: String }) products = ''
  @Property({ type: Number }) turnoverUsdM = null
  @Property({ type: Boolean }) isPrimary = false
  @Property({ type: Number }) displayOrder = 100
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
