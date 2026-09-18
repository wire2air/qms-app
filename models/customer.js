import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('customers', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, email, organizationId',
  schemaVersion: 1,
})
export class Customer extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) {
      this.companyId = currentSession.value?.companyId || ''
    }
    if (!this.id) {
      this.id = crypto.randomUUID()
    }
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String }) name = /** @type {String} */ (null)
  @Property({ type: String, required: true }) email = ''
  @Property({ type: String }) phone = /** @type {String} */ (null)
  @Property({ type: String }) organizationId = /** @type {String} */ (null)
  @Property({ type: String }) notes = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
