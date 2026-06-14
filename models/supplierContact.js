import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('supplierContacts', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'supplierId',
})
export class SupplierContact extends BaseModel {
  static paranoid = true // Enable soft deletes using deletedAt field
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
  // Optional link to one of the supplier's locations (shared list + tag).
  @Property({ type: String }) supplierLocationId = ''
  @Property({ type: String }) name = ''
  @Property({ type: String }) jobTitle = ''
  // email / phone no longer required — a contact may be name-only.
  @Property({ type: String }) email = ''
  @Property({ type: String }) phoneNumber = ''
  @Property({ type: Boolean }) isPrimary = false
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
