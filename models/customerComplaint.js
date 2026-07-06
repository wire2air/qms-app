import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('customerComplaints', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, statusId, assignedTo',
  schemaVersion: 2,
})
export class CustomerComplaint extends BaseModel {
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
  @Property({ type: String }) complaintNumber = ''
  @Property({ type: String, required: true }) subject = ''
  @Property({ type: String }) description = ''
  @Property({ type: String }) statusId = 'NEW'
  @Property({ type: String }) priorityId = /** @type {String} */ (null)
  @Property({ type: String }) sourceId = 'WEB'
  @Property({ type: String }) customerName = /** @type {String} */ (null)
  @Property({ type: String }) customerEmail = /** @type {String} */ (null)
  @Property({ type: String }) customerCompany = /** @type {String} */ (null)
  @Property({ type: String }) customerPhone = /** @type {String} */ (null)
  @Property({ type: String }) assignedTo = /** @type {String} */ (null)
  // Group routing — teams ("groups" in the UI).
  @Property({ type: String }) assignedTeamId = /** @type {String} */ (null)
  // POSITIVE | NEUTRAL | NEGATIVE | URGENT (manual or routing rules).
  @Property({ type: String }) sentiment = /** @type {String} */ (null)
  // Spam tickets hide from the default list and stats.
  @Property({ type: Boolean }) isSpam = false
  @Property({ type: String }) spamMarkedBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) spamMarkedAt = /** @type {DateTime} */ (null)
  // Requester linkage (customer layer) — history/trending.
  @Property({ type: String }) customerId = /** @type {String} */ (null)
  @Property({ type: String }) organizationId = /** @type {String} */ (null)
  // First public agent reply (response-time analytics + SLA).
  @Property({ type: DateTime }) firstResponseAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) slaFirstResponseDueAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) slaResolutionDueAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) slaNotifiedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) lastRoutedAt = /** @type {DateTime} */ (null)
  @Property({ type: Number }) csatRating = /** @type {Number} */ (null)
  @Property({ type: String }) csatComment = /** @type {String} */ (null)
  @Property({ type: DateTime }) csatSubmittedAt = /** @type {DateTime} */ (null)
  // Email channel the ticket arrived on (null for web/manual tickets).
  @Property({ type: String }) channelId = /** @type {String} */ (null)
  // Public intake form the ticket came from (sourceId WEB_FORM).
  @Property({ type: String }) formId = /** @type {String} */ (null)
  // Dynamic form values submitted with the ticket (flat payload).
  @Property({ type: Object }) customFields = /** @type {Object} */ (null)
  // Immutable form definition captured at submission time — old tickets
  // always render from this, never from the (possibly edited) live form.
  @Property({ type: Object }) formSnapshot = /** @type {Object} */ (null)
  @Property({ type: DateTime }) lastCustomerMessageAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) resolvedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) closedAt = /** @type {DateTime} */ (null)
  // Nullable — email-created tickets have no acting user.
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: String }) updatedBy = /** @type {String} */ (null)
  // ─── QMS expansion — first-class fields (see complaint-qms-expansion plan) ───
  @Property({ type: String }) complaintSourceId = /** @type {String} */ (null)
  @Property({ type: String }) regionId = /** @type {String} */ (null)
  @Property({ type: String }) countryId = /** @type {String} */ (null)
  @Property({ type: String }) stateProvince = /** @type {String} */ (null)
  @Property({ type: String }) siteId = /** @type {String} */ (null)
  @Property({ type: String }) productId = /** @type {String} */ (null)
  @Property({ type: String }) productCodeSku = /** @type {String} */ (null)
  @Property({ type: String }) batchLotSerial = /** @type {String} */ (null)
  @Property({ type: Number }) quantityAffected = /** @type {Number} */ (null)
  @Property({ type: String }) orderInvoiceNumber = /** @type {String} */ (null)
  @Property({ type: String }) customerTypeId = /** @type {String} */ (null)
  @Property({ type: String }) categoryId = /** @type {String} */ (null)
  @Property({ type: String }) subCategoryId = /** @type {String} */ (null)
  @Property({ type: String }) complaintTypeId = /** @type {String} */ (null)
  @Property({ type: String }) severityId = /** @type {String} */ (null)
  @Property({ type: String }) riskLevelId = /** @type {String} */ (null)
  @Property({ type: Boolean }) regulatoryReportable = false
  @Property({ type: Boolean }) safetyIssue = false
  @Property({ type: String }) ownerId = /** @type {String} */ (null)
  @Property({ type: String }) investigation = /** @type {String} */ (null)
  @Property({ type: String }) reviewSummary = /** @type {String} */ (null)
  @Property({ type: DateTime }) investigationStartedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) resolutionTargetAt = /** @type {DateTime} */ (null)
  @Property({ type: Boolean }) closureApprovalRequired = false
  @Property({ type: String }) closureApprovedBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) closureApprovedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) closureEsignId = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
