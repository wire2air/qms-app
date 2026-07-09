import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

// QMS quality complaint — standalone from the support customer_complaints table.
// Runs its QA review through the generic workflow engine (resourceType 'Complaint').
@ClientModel('complaints', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, statusId, ownerId',
  schemaVersion: 2,
})
export class Complaint extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String }) complaintNumber = ''
  // Optional bridge to the support ticket this was escalated from.
  @Property({ type: String }) sourceComplaintId = /** @type {String} */ (null)

  @Property({ type: String, required: true }) subject = ''
  @Property({ type: String }) description = /** @type {String} */ (null)
  @Property({ type: String }) statusId = 'NEW'

  // Classification / origin (tenant lookups).
  @Property({ type: String }) sourceId = /** @type {String} */ (null)
  @Property({ type: String }) categoryId = /** @type {String} */ (null)
  @Property({ type: String }) subCategoryId = /** @type {String} */ (null)
  @Property({ type: String }) typeId = /** @type {String} */ (null)
  @Property({ type: String }) severityId = /** @type {String} */ (null)
  @Property({ type: String }) riskLevelId = /** @type {String} */ (null)
  @Property({ type: String }) regionId = /** @type {String} */ (null)
  @Property({ type: String }) countryId = /** @type {String} */ (null)
  @Property({ type: String }) stateProvince = /** @type {String} */ (null)
  @Property({ type: String }) customerTypeId = /** @type {String} */ (null)
  @Property({ type: String }) siteId = /** @type {String} */ (null)
  @Property({ type: String }) supplierId = /** @type {String} */ (null)
  @Property({ type: Boolean }) sampleReceived = /** @type {Boolean} */ (null)

  // Product / lot.
  @Property({ type: String }) productId = /** @type {String} */ (null)
  @Property({ type: String }) batchLotSerial = /** @type {String} */ (null)
  @Property({ type: Number }) quantityAffected = /** @type {Number} */ (null)
  @Property({ type: String }) orderInvoiceNumber = /** @type {String} */ (null)

  // Customer contact (standalone capture).
  @Property({ type: String }) customerName = /** @type {String} */ (null)
  @Property({ type: String }) customerEmail = /** @type {String} */ (null)
  @Property({ type: String }) customerCompany = /** @type {String} */ (null)
  @Property({ type: String }) customerPhone = /** @type {String} */ (null)

  // QA assessment flags.
  @Property({ type: Boolean }) safetyIssue = false
  @Property({ type: Boolean }) regulatoryReportable = false
  @Property({ type: Boolean }) complianceRelated = false
  @Property({ type: Boolean }) potentialRecall = false
  @Property({ type: Boolean }) repeatIssue = false

  // Investigation / review.
  @Property({ type: String }) investigation = /** @type {String} */ (null)
  @Property({ type: Boolean }) investigationRequired = /** @type {Boolean} */ (null)
  @Property({ type: String }) investigationWaivedReason = /** @type {String} */ (null)
  @Property({ type: DateTime }) investigationStartedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) reviewSummary = /** @type {String} */ (null)
  @Property({ type: String }) disposition = /** @type {String} */ (null)

  // Reportability assessment.
  @Property({ type: String }) reportabilityStatus = /** @type {String} */ (null)
  @Property({ type: String }) reportabilitySchemeId = /** @type {String} */ (null)
  @Property({ type: String }) reportabilityRationale = /** @type {String} */ (null)
  @Property({ type: String }) reportabilityDecidedBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) reportabilityDecidedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) reportDueAt = /** @type {DateTime} */ (null)

  // SLA / lifecycle.
  @Property({ type: DateTime }) resolutionTargetAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) resolvedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) closedAt = /** @type {DateTime} */ (null)

  // Ownership.
  @Property({ type: String }) ownerId = /** @type {String} */ (null)
  @Property({ type: String }) closureApprovedBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) closureApprovedAt = /** @type {DateTime} */ (null)

  // Workflow.
  @Property({ type: String }) workflowVersionId = /** @type {String} */ (null)
  @Property({ type: Object }) pendingReviewers = /** @type {Object} */ (null)

  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: String }) updatedBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
