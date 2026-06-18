import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('nonconformances', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId',
  schemaVersion: 1,
})
export class Nonconformance extends BaseModel {
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
  @Property({ type: String }) ncNumber = ''
  @Property({ type: String, required: true }) title = ''
  @Property({ type: String }) description = ''
  @Property({ type: String }) statusId = 'DRAFT'
  @Property({ type: String, required: true }) severityId = ''
  @Property({ type: String, required: true }) typeId = ''
  @Property({ type: String, required: true }) sourceId = ''
  @Property({ type: String, required: true }) siteId = ''
  @Property({ type: String, required: true }) departmentId = ''
  @Property({ type: String, required: true }) ownerId = ''
  @Property({ type: String }) workflowVersionId = /** @type {String} */ (null)
  @Property({ type: Object }) pendingReviewers = /** @type {Object} */ ({})
  @Property({ type: DateTime }) detectedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) dueDate = /** @type {DateTime} */ (null)
  @Property({ type: String }) productId = null
  @Property({ type: String }) supplierId = null
  // Supplier-facing flag. When true, the workflow attached to this NC
  // resolves every step's assignee from supplier users (filtered to
  // supplierId) instead of the internal role pool. Immutable once
  // submitted; backend enforces.
  @Property({ type: Boolean }) isSupplierFacing = false
  @Property({ type: Array }) notifyGroupIds = /** @type {Array} */ ([])
  @Property({ type: Array }) notifyUserIds = /** @type {Array} */ ([])
  // Top-section classification (added 2026-05-29). Independent of the
  // existing typeId — issue-type captures the discovery dimension
  // (out-of-spec / receiving / missing standard), typeId stays the
  // nature of the NC. priorityId mirrors CAPA's enum.
  @Property({ type: String }) ncIssueTypeId = null
  @Property({ type: String }) priorityId = null
  @Property({ type: String }) poNumber = ''
  @Property({ type: String }) orderNumber = ''
  @Property({ type: String }) lotNumber = ''
  @Property({ type: String }) qtyAffected = null
  @Property({ type: String }) unitOfMeasure = ''
  @Property({ type: String }) costOfNc = null
  @Property({ type: String }) creditFromSupplier = null
  @Property({ type: String }) rootCauseCategoryId = null
  @Property({ type: String }) rootCause = ''
  @Property({ type: String }) dispositionTypeId = null
  @Property({ type: Boolean }) capaRequired = null
  @Property({ type: String }) dispositionNotes = ''
  @Property({ type: String }) immediateContainmentAction = ''
  @Property({ type: DateTime }) closedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) markedCompleteAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) markedCompleteBy = null
  @Property({ type: String, required: true }) createdBy = ''
  @Property({ type: String, required: true }) updatedBy = ''
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
}
