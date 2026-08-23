import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('records', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'templateId, moduleKey, supplierId',
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
  // Optional FKs default to null, never ''. serializeModel sends every property
  // verbatim and serializeValue only short-circuits null/undefined, so an unset
  // '' lands in the column: PostGraphile's UUID scalar rejects it at variable
  // coercion (HTTP 400), and documentTypeId (a varchar FK) violates its FK.
  @Property({ type: String }) documentTypeId = null
  @Property({ type: String, required: true }) recordNumber = ''
  @Property({ type: String }) statusId = 'DRAFT'
  @Property({ type: Object }) payload = null
  @Property({ type: String }) submissionIp = ''
  @Property({ type: String, required: true }) userId = ''
  // --- generic-module envelope ---
  @Property({ type: String }) ownerUserId = null
  @Property({ type: String }) workflowInstanceId = null
  @Property({ type: Array }) notifyUserIds = []
  @Property({ type: Array }) notifyEmails = /** @type {Array} */ ([])
  @Property({ type: Array }) notifyGroupIds = []
  @Property({ type: String }) moduleKey = ''
  @Property({ type: String }) siteId = null
  @Property({ type: String }) departmentId = null
  @Property({ type: DateTime }) dueDate = null
  @Property({ type: DateTime }) completedAt = null
  @Property({ type: String }) supplierId = null
  @Property({ type: DateTime }) nextReviewDate = null
  // Computed weighted score + rating band, sealed on workflow complete.
  @Property({ type: Object }) scoringResult = null
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
