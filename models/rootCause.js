import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * RootCause — the mineable side-channel for RCA widget output.
 *
 * One row per finalized root cause. A parent record (CAPA / NC / CR)
 * can carry one isPrimary=true plus several contributing rows. The
 * original nested widget payload (5-Why branches, fishbone categories,
 * etc.) still lives on {nc,capa,cr}Records.payload for traceability;
 * this row is the normalized aggregation surface for reports.
 *
 * Label denormalization: rcaTemplateName, categoryLabel, categoryColor
 * are copied at write time so historical rows survive a template /
 * category rename or delete. Matches the freezeFormPayloadLabels
 * pattern used for form payloads.
 */
@ClientModel('rootCauses', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, [resourceType+resourceId], categoryId, workflowInstanceStepId',
})
export class RootCause extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.createdBy) this.createdBy = currentSession.value?.userId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''

  // Polymorphic parent — Capa / Nonconformance / ChangeRequest today.
  @Property({ type: String, required: true }) resourceType = ''
  @Property({ type: String, required: true }) resourceId = ''

  @Property({ type: String }) workflowInstanceStepId = ''

  // Source RCA template — soft FK + denormalized name.
  @Property({ type: String }) rcaTemplateId = ''
  @Property({ type: String }) rcaTemplateName = ''

  // FIVE_WHY / FISHBONE / IS_NOT / WHY_TREE / FAULT_TREE.
  @Property({ type: String }) methodUsed = ''

  // Soft FK to root_cause_categories + frozen label / color.
  @Property({ type: String }) categoryId = ''
  @Property({ type: String }) categoryLabel = ''
  @Property({ type: String }) categoryColor = ''

  @Property({ type: String, required: true }) description = ''

  @Property({ type: Boolean }) isPrimary = true

  @Property({ type: String }) evidenceUrl = ''

  @Property({ type: String }) createdBy = ''
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
