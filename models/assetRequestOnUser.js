import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('assetRequestsOnUsers', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'assetRequestId',
})
export class AssetRequestOnUser extends BaseModel {
  static paranoid = true
  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) assetRequestId = ''
  @Property({ type: String, required: true }) userId = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
