import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('capas', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, [sourceType+sourceId]',
  schemaVersion: 1,
})
export class Capa extends BaseModel {
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
  @Property({ type: String }) capaNumber = ''
  @Property({ type: String, required: true }) title = ''
  @Property({ type: String }) description = ''
  @Property({ type: String }) statusId = 'DRAFT'
  @Property({ type: String, required: true }) priorityId = ''
  @Property({ type: String, required: true }) typeId = ''
  @Property({ type: String, required: true }) sourceType = ''
  @Property({ type: String, required: true }) siteId = ''
  @Property({ type: String, required: true }) departmentId = ''
  @Property({ type: String, required: true }) ownerId = ''
  @Property({ type: String }) workflowVersionId = /** @type {String} */ (null)
  @Property({ type: String }) sourceId = /** @type {String} */ (null)
  @Property({ type: DateTime }) initiatedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) dueDate = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) completedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) closedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) cancelledAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) cancelReason = /** @type {String} */ (null)
  // Planning preference (days from close). Used as the default preset in
  // the Close dialog's effectiveness-check picker. Industry default: 90.
  @Property({ type: Number }) ecIntervalDays = 90
  @Property({ type: String }) rootCauseCategoryId = null
  @Property({ type: DateTime }) verifiedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) verifiedBy = /** @type {String} */ (null)
  @Property({ type: Object }) effectivenessCheck = /** @type {Object} */ ({})
  @Property({ type: Object }) scheduledCycle = /** @type {Object} */ (null)
  // Reviewer map { workflowStepId: [userId, …] } held on the row from
  // create-time until submitCapaForReview consumes it to seed the workflow.
  @Property({ type: Object }) pendingReviewers = /** @type {Object} */ ({})
  @Property({ type: Array }) notifyGroupIds = /** @type {Array} */ ([])
  @Property({ type: Array }) notifyUserIds = /** @type {Array} */ ([])
  @Property({ type: String, required: true }) createdBy = ''
  @Property({ type: String, required: true }) updatedBy = ''
  @Property({ type: String }) supplierId = null
  // Supplier-facing flag. When true, the workflow attached to this CAPA
  // resolves every step's assignee from supplier users (filtered to
  // supplierId) instead of the internal role pool. Immutable once
  // submitted; backend enforces.
  @Property({ type: Boolean }) isSupplierFacing = false
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
}
