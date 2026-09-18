import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('workflows', { primaryKey: 'id', syncField: 'updatedAt', customIndex: 'moduleId' })
export class Workflow extends BaseModel {
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
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = ''
  @Property({ type: String, required: true }) moduleId = ''
  @Property({ type: Boolean }) isDefault = false
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String }) statusId = 'ACTIVE'
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
