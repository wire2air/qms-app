import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('products', { primaryKey: 'id', syncField: 'updatedAt' })
export class Product extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) {
      this.companyId = currentSession.value?.companyId || ''
    }
    if (!this.id) {
      this.id = crypto.randomUUID()
    }
    if (!this.createdBy) {
      this.createdBy = currentSession.value?.userId || ''
    }

    if (!this.updatedBy) {
      this.updatedBy = currentSession.value?.userId || ''
    }
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String, required: true }) sku = ''
  @Property({ type: String }) description = ''
  @Property({ type: String }) productFamilyId = null
  @Property({ type: String, required: true }) productTypeId = ''
  @Property({ type: String, required: true }) statusId = 'ACTIVE'
  @Property({
    type: String,
    required: true,
  })
  createdBy = ''
  @Property({ type: String, required: true }) updatedBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
