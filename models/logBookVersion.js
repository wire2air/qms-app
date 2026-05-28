import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * LogBookVersion — a controlled revision of a log book (document parity).
 *
 * The parent LogBook holds identity + pointers (currentEffectiveVersionId
 * / latestDraftVersionId); each version captures the schema + policy
 * snapshot for one revision. Approval runs through the generic workflow
 * engine — `workflowInstanceId` links to the running WorkflowInstance
 * (resourceType 'LogBookVersion'), and the approver's approve/readonly UI
 * keys off whether they hold an active TaskInstance on a step of that
 * instance, exactly like document versions.
 *
 * status flow: DRAFT → UNDER_REVIEW → EFFECTIVE; reject → REJECTED;
 * a new effective version SUPERSEDES the prior one.
 *
 * Created by migration 20260628001200-create-log-book-versions.js.
 */
@ClientModel('logBookVersions', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, logBookId, statusId, workflowInstanceId',
})
export class LogBookVersion extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) logBookId = ''

  @Property({ type: Number }) versionMajor = 1
  @Property({ type: Number }) versionMinor = 0
  @Property({ type: String, required: true }) statusId = 'DRAFT'

  // Schema + policy snapshot frozen into this version.
  @Property({ type: Array }) schema = /** @type {Array} */ ([])
  @Property({ type: String, required: true }) recordClassification = 'OPERATIONAL_LOG'
  @Property({ type: String }) editWindowMode = 'TIME_WINDOW'
  @Property({ type: Number }) editWindowMinutes = null
  @Property({ type: Boolean }) signatureRequired = false
  @Property({ type: Boolean }) reviewRequired = false
  @Property({ type: String }) notifyOnSubmit = 'DIGEST'
  @Property({ type: String }) changeSummary = ''

  // Approval engine linkage + effective lifecycle.
  @Property({ type: String }) workflowInstanceId = ''
  @Property({ type: DateTime }) effectiveAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) supersededAt = /** @type {DateTime} */ (null)

  @Property({ type: String }) createdBy = ''

  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
