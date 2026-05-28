import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AssetRequestItem — one line in an asset_requests bundle.
 *
 * Either references a master-list type (assetRequestTypeId set) or
 * carries an ad-hoc customTitle (for one-off requests outside the
 * pre-seeded / tenant-extended list). The backend CHECK enforces
 * exactly one path is populated.
 *
 * Status moves PENDING → RECEIVED on supplier upload, or → SKIPPED
 * if the client cancels that line. Parent asset_requests closes
 * when every item is RECEIVED-or-SKIPPED.
 */
@ClientModel('assetRequestItems', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'assetRequestId, [assetRequestId+statusId]',
})
export class AssetRequestItem extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) assetRequestId = ''
  @Property({ type: String }) assetRequestTypeId = null
  @Property({ type: String }) customTitle = ''
  @Property({ type: String }) customDescription = ''
  @Property({ type: String }) statusId = 'PENDING'
  @Property({ type: String }) supplierDocumentId = null
  @Property({ type: String }) notes = ''
  @Property({ type: DateTime }) uploadedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) uploadedBy = null

  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
