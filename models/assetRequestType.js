import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('assetRequestTypes', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId',
})
export class AssetRequestType extends BaseModel {
  @Property({ type: String, required: true }) id = ''
  // NULL = globally seeded industry standard (ISO_CERT, GST_CERT, …).
  // Tenant UUID = a custom type added by that company.
  @Property({ type: String }) companyId = null
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = ''
  @Property({ type: Number }) displayOrder = 1000
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
