import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('taskInstances', {
  primaryKey: 'id',
  loadStrategy: 'instant',
  syncField: 'updatedAt',
  customIndex: '[entityType+entityId], [sourceType+sourceId], assignedTo',
  schemaVersion: 2,
})
export class TaskInstance extends BaseModel {
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
  @Property({ type: String, required: true }) assignedTo = ''
  @Property({ type: String, required: true }) taskKindId = ''
  @Property({ type: String }) statusId = 'ASSIGNED'
  @Property({ type: String, required: true }) priorityId = ''
  @Property({ type: DateTime, required: true }) dueDate = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) completedAt = null
  @Property({ type: String, required: true }) entityType = ''
  @Property({ type: String, required: true }) entityId = ''
  @Property({ type: String, required: true }) sourceType = ''
  @Property({ type: String, required: true }) sourceId = ''
  @Property({ type: String }) reassignedToUserId = null
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
