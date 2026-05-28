import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('supplierAssets', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'supplierId',
})
export class SupplierAsset extends BaseModel {
  static paranoid = true
  constructor(...args) {
    super(...args)
    // Auto-assign companyId from current session on creation
    if (!this.companyId) {
      this.companyId = currentSession.value?.companyId || ''
    }

    if (!this.id) {
      this.id = crypto.randomUUID()
    }
  }
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) supplierId = ''
  @Property({ type: String, required: true }) assetId = ''
  // requestId is nullable: present when the row was created from an
  // asset_request_items upload, null for ad-hoc admin attachments.
  @Property({ type: String }) requestId = null
  @Property({ type: String, required: true }) documentType = ''
  // Optional metadata used mainly for ad-hoc rows; request-flow rows
  // fall back to the underlying Asset.originalFilename in the UI.
  @Property({ type: String }) title = null
  @Property({ type: String }) description = null
  @Property({ type: String }) uploadedBy = null
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
