import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * RiskAssessment — the mineable side-channel for Risk Assessment
 * widget output.
 *
 * One row per finalized assessment. INITIAL vs RESIDUAL via
 * assessmentType — a record can carry both as separate rows.
 *
 * Every dimension that can drift is denormalized at write time:
 *   - riskAssessmentTemplateName
 *   - hazardCategoryLabel, hazardCategoryColor
 *   - likelihoodLabel + likelihoodScore
 *   - severityLabel + severityScore
 *   - detectabilityLabel + detectabilityScore (FMEA mode only)
 *   - computedRiskLevelLabel + computedScore
 *
 * Reports stay self-consistent across template edits / category
 * renames / config recomputation.
 */
@ClientModel('riskAssessments', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex:
    'companyId, [resourceType+resourceId], hazardCategoryId, workflowInstanceStepId',
})
export class RiskAssessment extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.createdBy) this.createdBy = currentSession.value?.userId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''

  @Property({ type: String, required: true }) resourceType = ''
  @Property({ type: String, required: true }) resourceId = ''

  @Property({ type: String }) workflowInstanceStepId = ''

  // Template — soft FK + denormalized name.
  @Property({ type: String }) riskAssessmentTemplateId = ''
  @Property({ type: String }) riskAssessmentTemplateName = ''

  // Hazard category — soft FK + frozen label / color.
  @Property({ type: String }) hazardCategoryId = ''
  @Property({ type: String }) hazardCategoryLabel = ''
  @Property({ type: String }) hazardCategoryColor = ''

  // INITIAL / RESIDUAL.
  @Property({ type: String, required: true }) assessmentType = 'INITIAL'

  // Likelihood / severity / detectability — IDs point at template
  // config rows (not FK to a table). Labels + scores denormalized.
  @Property({ type: String }) likelihoodId = ''
  @Property({ type: String }) likelihoodLabel = ''
  @Property({ type: Number }) likelihoodScore = null
  @Property({ type: String }) severityId = ''
  @Property({ type: String }) severityLabel = ''
  @Property({ type: Number }) severityScore = null
  @Property({ type: String }) detectabilityId = ''
  @Property({ type: String }) detectabilityLabel = ''
  @Property({ type: Number }) detectabilityScore = null

  @Property({ type: String }) computedRiskLevelId = ''
  @Property({ type: String }) computedRiskLevelLabel = ''
  @Property({ type: Number }) computedScore = null

  @Property({ type: String }) justification = ''

  @Property({ type: String }) createdBy = ''
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
