import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * ProductOption — READ-ONLY picker projection of `products`.
 *
 * Backed by the `product_options` view (migration 20260807100000). Everyone in
 * the tenant can read it; the full Product record still requires
 * `products:read`. Use this in pickers and badges — anywhere you only need
 * id / SKU / name. Use `Product` on the Item Master workspace and detail pages.
 *
 * `sku` is here because the item pickers list and search as "SKU - Name" and
 * ProductBadge leads with the SKU; it is an identifier, not commercial data.
 *
 * Never write through this model: the view is granted SELECT only and carries
 * `@omit create,update,delete`, so a mutation fails at the database. Item
 * creation goes through `Product` and still needs `products:create`.
 */
@ClientModel('productOptions', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'statusId',
})
export class ProductOption extends BaseModel {
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) sku = ''
  @Property({ type: String }) statusId = ''

  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
