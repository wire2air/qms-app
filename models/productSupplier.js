import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * ProductSupplier — Item ↔ Supplier link (products_on_suppliers). Mutated from
 * the Item form via the syncEngine (create + soft-delete diffing), same
 * join-table pattern as RoleOnUser / SupplierOnSite.
 */
@ClientModel('productsOnSuppliers', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: '[productId+supplierId], productId, supplierId',
})
export class ProductSupplier extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) productId = ''
  @Property({ type: String, required: true }) supplierId = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
