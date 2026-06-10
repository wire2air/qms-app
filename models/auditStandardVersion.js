import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AuditStandardVersion — controlled revision of an audit standard.
 * Mirrors LogBookVersion / DocumentVersion: DRAFT → UNDER_REVIEW →
 * EFFECTIVE → REJECTED → SUPERSEDED. One EFFECTIVE per standard at a
 * time.
 */
@ClientModel('auditStandardVersions', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, auditStandardId, [auditStandardId+statusId]',
})
export class AuditStandardVersion extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.createdBy) this.createdBy = currentSession.value?.userId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) auditStandardId = ''
  @Property({ type: Number }) versionMajor = 1
  @Property({ type: Number }) versionMinor = 0
  @Property({ type: String }) versionLabel = ''
  @Property({ type: String }) changeSummary = ''
  @Property({ type: String, required: true }) statusId = 'DRAFT'
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
