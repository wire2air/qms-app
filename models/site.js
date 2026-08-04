import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('sites', { primaryKey: 'id', syncField: 'updatedAt' })
export class Site extends BaseModel {
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
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String, required: true }) code = ''
  @Property({ type: String }) address = ''
  @Property({ type: String }) timezone = 'UTC'
  // Gates NEW user assignments only — an inactive site keeps the assignments it
  // already has, so winding a site down doesn't silently revoke access to the
  // records still open there.
  @Property({ type: Boolean }) isActive = true
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
