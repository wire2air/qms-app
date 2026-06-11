import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('documentVersions', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'documentId, [documentId+statusId], versionMajor, versionMinor, workflowInstanceId',
  schemaVersion: 3,
})
export class DocumentVersion extends BaseModel {
  static paranoid = true // Enable soft deletes using deletedAt field
  constructor(...args) {
    super(...args)
    // Auto-assign companyId from current session on creation
    if (!this.companyId) {
      this.companyId = currentSession.value?.companyId || ''
    }

    if (!this.id) {
      this.id = crypto.randomUUID()
    }

    if (!this.createdBy) {
      this.createdBy = currentSession.value?.userId
    }
  }
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) documentId = ''
  @Property({ type: Number }) versionMajor = 1
  @Property({ type: Number }) versionMinor = 0
  @Property({ type: String }) versionLabel = ''
  @Property({ type: String }) changeSummary = ''
  @Property({ type: String }) changeReason = ''
  @Property({ type: String }) changeType = '' // ADMINISTRATIVE | MINOR | MAJOR
  @Property({ type: Boolean }) regulatoryImpact = false
  @Property({ type: String }) regulatoryImpactNotes = ''
  @Property({ type: Array }) affectedSectionIds = /** @type {Array} */ ([]) // section ids the author marked as changed
  @Property({ type: Object }) trainingConfig = null
  @Property({ type: String, required: true }) createdBy = ''
  @Property({ type: DateTime }) lockedAt = null
  @Property({ type: DateTime }) approvedAt = null
  @Property({ type: String, excludeFromGraphQL: ['update'] }) statusId = 'DRAFT'
  @Property({ type: String }) workflowInstanceId = /** @type {String|null} */ (null)
  @Property({ type: Boolean }) isLatest = true
  @Property({ type: DateTime }) effectiveDate = DateTime.now()
  // Immutable EFFECTIVE snapshot — populated by the worker when the
  // version transitions to EFFECTIVE. Used by the doc detail page to
  // surface a "View Audit PDF" link once available.
  @Property({ type: String }) snapshotStoragePath = /** @type {String|null} */ (null)
  @Property({ type: String }) snapshotSha256 = /** @type {String|null} */ (null)
  @Property({ type: DateTime }) snapshotGeneratedAt = /** @type {DateTime|null} */ (null)
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
