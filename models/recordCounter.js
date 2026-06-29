import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('recordCounters', { primaryKey: 'templateId', syncField: 'updatedAt' })
export class RecordCounter extends BaseModel {
  static paranoid = true // Enable soft deletes using deletedAt field
  constructor(...args) {
    super(...args)
    // Auto-assign companyId from current session on creation
    if (!this.companyId) {
      this.companyId = currentSession.value?.companyId || ''
    }
  }
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String }) templateId = ''
  @Property({ type: Number }) currentValue = 1
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
