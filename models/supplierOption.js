import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * SupplierOption — READ-ONLY picker projection of `suppliers`.
 *
 * Backed by the `supplier_options` view (migration 20260807100000). Everyone in
 * the tenant can read it; the full Supplier record still requires
 * `supplier_management:read`. Use this in pickers and badges — anywhere you
 * only need to turn an id into a name. Use `Supplier` on the Suppliers
 * workspace and detail pages, where the commercial fields (risk level,
 * revenue, evaluation dates, DUNS, address) are the point.
 *
 * Never write through this model: the view is granted SELECT only and carries
 * `@omit create,update,delete`, so a mutation fails at the database.
 *
 * Adding a field here means adding a column to the view, which widens what
 * every user in the tenant can read. Treat that as a permission change.
 */
@ClientModel('supplierOptions', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'statusId',
})
export class SupplierOption extends BaseModel {
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) statusId = ''

  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
