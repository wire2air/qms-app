import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('records', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'templateId, moduleKey',
})
export class Record extends BaseModel {
  static paranoid = true // Enable soft deletes using deletedAt field
  constructor(...args) {
    super(...args)
    // Auto-assign companyId and userId from current session on creation
    if (!this.companyId) {
      this.companyId = currentSession.value?.companyId || ''
    }

    if (!this.userId) {
      this.userId = currentSession.value?.userId || ''
    }

    if (!this.id) {
      this.id = crypto.randomUUID()
    }
  }
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) templateId = ''
  @Property({ type: String }) documentTypeId = ''
  @Property({ type: String, required: true }) recordNumber = ''
  @Property({ type: String }) statusId = 'DRAFT'
  @Property({ type: Object }) payload = null
  @Property({ type: String }) submissionIp = ''
  @Property({ type: String, required: true }) userId = ''
  // --- generic-module envelope ---
  @Property({ type: String }) ownerUserId = ''
  @Property({ type: String }) workflowInstanceId = ''
  @Property({ type: Array }) notifyUserIds = []
  @Property({ type: Array }) notifyGroupIds = []
  @Property({ type: String }) moduleKey = ''
  @Property({ type: String }) siteId = ''
  @Property({ type: String }) departmentId = ''
  @Property({ type: DateTime }) dueDate = null
  @Property({ type: DateTime }) completedAt = null
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
