import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('specifications', { primaryKey: 'id', syncField: 'updatedAt', customIndex: 'productId' })
export class Specification extends BaseModel {
  static paranoid = true
  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) code = /** @type {String} */ (null)
  @Property({ type: String }) productId = /** @type {String} */ (null)
  @Property({ type: String }) productFamilyId = /** @type {String} */ (null)
  @Property({ type: String }) productTypeId = /** @type {String} */ (null)
  @Property({ type: String }) statusId = 'DRAFT'
  @Property({ type: Number }) version = 1
  @Property({ type: String }) parentSpecificationId = /** @type {String} */ (null)
  @Property({ type: DateTime }) effectiveFrom = null
  @Property({ type: DateTime }) effectiveUntil = null
  @Property({ type: String }) approvedByUserId = /** @type {String} */ (null)
  @Property({ type: DateTime }) approvedAt = null
  @Property({ type: String }) signatureId = /** @type {String} */ (null)
  @Property({ type: String }) notes = /** @type {String} */ (null)
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
