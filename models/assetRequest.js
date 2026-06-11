import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('assetRequests', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'supplierId, [supplierId+statusId]',
})
export class AssetRequest extends BaseModel {
  static paranoid = true // Enable soft deletes using deletedAt field
  constructor(...args) {
    super(...args)
    // Auto-assign companyId from current session on creation
    if (!this.companyId) {
      this.companyId = currentSession.value?.companyId || ''
    }

    if (!this.createdBy) {
      this.createdBy = currentSession.value?.userId
    }

    if (!this.id) {
      this.id = crypto.randomUUID()
    }
  }
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) supplierId = ''
  @Property({ type: String, required: true }) companyId = ''
  // Phase C: per-item type lives on asset_request_items; parent
  // bundles intentionally leave requestTypeId null. Same for dueDate
  // — admin can omit on create.
  @Property({ type: String }) requestTypeId = null
  @Property({ type: String, required: true }) title = ''
  @Property({ type: String }) description = ''
  @Property({ type: DateTime }) dueDate = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) expiryDate = /** @type {DateTime} */ (null)
  @Property({ type: String }) statusId = 'PENDING'
  @Property({ type: String }) createdBy = null
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
