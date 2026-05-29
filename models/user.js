import { currentCompany } from '@/utils/currentCompany'
import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('users', { primaryKey: 'id', syncField: 'updatedAt' })
export class User extends BaseModel {
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

    if (!this.timeZone) {
      this.timeZone = currentCompany.value?.defaultTimeZone || 'UTC'
    }
  }
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) firstName = ''
  @Property({ type: String }) lastName = ''
  @Property({ type: String, required: true }) email = ''
  @Property({ type: String, required: true }) userStatusId = 'INACTIVE'
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String }) jobTitle = ''
  @Property({ type: String }) languageId = ''
  @Property({ type: String, required: true }) timeZone = 'UTC'
  @Property({ type: Boolean }) inviteSent = false
  @Property({ type: String }) color = '#2563eb'
  @Property({ type: String }) avatar = ''
  @Property({ type: Boolean }) isOwner = false
  // INTERNAL — staff. EXTERNAL_SUPPLIER — supplier user (scoped + lands
  // on /supplier dashboard at login). Drives sidebar + routing.
  @Property({ type: String }) kind = 'INTERNAL'
  // Nullable UUID FKs default to null, not '', so PostGraphile's UUID
  // type validation doesn't reject "" → "Invalid UUID" on createUser.
  @Property({ type: String }) supplierId = null
  @Property({ type: String }) siteId = null
  @Property({ type: String }) departmentId = null
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
