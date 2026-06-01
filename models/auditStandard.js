import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AuditStandard — parent identity row for a versioned audit standard
 * library entry. LogBookVersion pattern: identity + version pointers
 * here; the requirement list lives on AuditRequirement under each
 * AuditStandardVersion.
 *
 * Audit instances created from this standard snapshot the effective
 * version's requirement list at instance creation so in-flight audits
 * don't drift when the standard is later edited.
 */
@ClientModel('auditStandards', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, [companyId+code], auditStandardTypeId',
})
export class AuditStandard extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.createdBy) this.createdBy = currentSession.value?.userId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String }) auditStandardTypeId = ''
  @Property({ type: String, required: true }) code = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = ''
  @Property({ type: DateTime }) effectiveDate = /** @type {DateTime} */ (null)
  @Property({ type: String }) currentEffectiveVersionId = ''
  @Property({ type: String }) latestDraftVersionId = ''
  @Property({ type: String }) workflowVersionId = ''
  @Property({ type: String, required: true }) statusId = 'ACTIVE'
  @Property({ type: String }) createdBy = ''
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
