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
  // QE-C1 (client half): the lifecycle is SERVER-OWNED. The four states are
  // DRAFT / OPEN / CLOSED / CANCELLED and the only legal edges are DRAFT→OPEN
  // (POST /submit), DRAFT→CANCELLED and OPEN→CANCELLED (POST /cancel, e-signed)
  // and OPEN→CLOSED (POST /close, e-signed). A status change arriving on the
  // GraphQL/syncEngine path is refused outright by the DB trigger with error
  // code QMSQE, so `excludeFromGraphQL: ['update']` keeps statusId out of the
  // generated updateQualityEvent mutation entirely — an inline autosave can
  // never even attempt the write it would be rejected for.
  //
  // Default is OPEN, not DRAFT: createQualityEvent writes OPEN server-side and
  // no code path creates a DRAFT event, so a DRAFT default only ever produced a
  // client instance that disagreed with the row the server returned.
  @Property({ type: String, required: true, excludeFromGraphQL: ['update'] }) statusId = 'OPEN'
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
