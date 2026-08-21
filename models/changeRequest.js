import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('changeRequests', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, [sourceType+sourceId]',
  schemaVersion: 1,
})
export class ChangeRequest extends BaseModel {
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
  @Property({ type: String }) crNumber = ''
  @Property({ type: String, required: true }) title = ''
  @Property({ type: String }) description = ''
  // CR-C1 (client half): status is server-enforced by the
  // enforce_cr_status_transition trigger; block the generated updateChangeRequest
  // mutation from ever carrying statusId so an inline .save() can't attempt a
  // lifecycle change (which the DB would reject anyway).
  @Property({ type: String, excludeFromGraphQL: ['update'] }) statusId = 'DRAFT'
  @Property({ type: String, required: true }) priorityId = ''
  @Property({ type: String, required: true }) changeTypeId = ''
  @Property({ type: String }) classification = null
  // Change-control intake attributes (detail right rail). Fixed enums:
  // PLANNED|EMERGENCY, TEMPORARY|PERMANENT, and two YES|NO flags.
  @Property({ type: String }) changeNature = null
  @Property({ type: String }) changeDuration = null
  @Property({ type: String }) regulatoryImpact = null
  @Property({ type: String }) customerNotificationRequired = null
  @Property({ type: String, required: true }) siteId = ''
  @Property({ type: String, required: true }) departmentId = ''
  @Property({ type: String, required: true }) ownerId = ''
  @Property({ type: String }) sourceType = 'DIRECT'
  @Property({ type: String }) sourceId = /** @type {String} */ (null)
  @Property({ type: DateTime }) initiatedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) targetImplementationDate = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) dueDate = /** @type {DateTime} */ (null)
  @Property({ type: String }) reasonForChange = ''
  @Property({ type: String }) businessJustification = ''
  @Property({ type: String }) workflowVersionId = /** @type {String} */ (null)
  @Property({ type: Object }) pendingReviewers = /** @type {Object} */ ({})
  @Property({ type: Boolean }) requiresEffectivenessCheck = false
  @Property({ type: DateTime }) submittedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) approvedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) closedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) cancelledAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) cancelledBy = /** @type {String} */ (null)
  @Property({ type: String }) cancelReason = /** @type {String} */ (null)
  @Property({ type: Array }) notifyGroupIds = /** @type {Array} */ ([])
  @Property({ type: Array }) notifyUserIds = /** @type {Array} */ ([])
  @Property({ type: Array }) notifyEmails = /** @type {Array} */ ([])
  @Property({ type: String, required: true }) createdBy = ''
  @Property({ type: String, required: true }) updatedBy = ''
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
}
