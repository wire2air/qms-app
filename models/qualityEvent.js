import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * QualityEvent — the Events & Observations intake record. Created via the REST
 * endpoint (POST /v1/services/qualityEvents — server mints the EV-###### number);
 * edited inline via the syncEngine. Status-driven lifecycle (no workflow engine).
 */
@ClientModel('qualityEvents', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, statusId, categoryId, severityId, assignedToUserId, reportedByUserId',
})
export class QualityEvent extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.createdBy) this.createdBy = currentSession.value?.userId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String }) eventNumber = ''
  @Property({ type: String, required: true }) title = ''
  @Property({ type: String }) description = ''
  @Property({ type: String }) categoryId = /** @type {String} */ (null)
  @Property({ type: String }) severityId = /** @type {String} */ (null)
  @Property({ type: String, required: true }) statusId = 'DRAFT'
  @Property({ type: String }) departmentId = /** @type {String} */ (null)
  @Property({ type: String }) siteId = /** @type {String} */ (null)
  @Property({ type: String }) supplierId = /** @type {String} */ (null)
  @Property({ type: String }) reportedByUserId = /** @type {String} */ (null)
  @Property({ type: String }) assignedToUserId = /** @type {String} */ (null)
  @Property({ type: Array }) notifyGroupIds = /** @type {Array} */ ([])
  @Property({ type: Array }) notifyUserIds = /** @type {Array} */ ([])
  @Property({ type: Array }) notifyEmails = /** @type {Array} */ ([])
  @Property({ type: Boolean }) anonymousSubmission = false
  @Property({ type: DateTime }) occurrenceDate = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) reportedDate = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) reviewDueDate = /** @type {DateTime} */ (null)
  @Property({ type: String }) reviewSummary = ''
  @Property({ type: String }) recommendedAction = ''
  @Property({ type: String }) decision = ''
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
