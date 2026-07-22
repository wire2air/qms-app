import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

// A tenant's sampling plan: STANDARD (standard + level + severity→AQL) or CUSTOM
// (custom_plan_table). Versioned + approved like specs.
@ClientModel('samplingPlans', { primaryKey: 'id', syncField: 'updatedAt', customIndex: 'statusId' })
export class SamplingPlan extends BaseModel {
  static paranoid = true
  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = /** @type {String} */ (null)
  @Property({ type: String }) productId = /** @type {String} */ (null)
  @Property({ type: String }) productFamilyId = /** @type {String} */ (null)
  @Property({ type: String }) productTypeId = /** @type {String} */ (null)
  @Property({ type: String, required: true }) inspectionPoint = 'INCOMING'
  @Property({ type: String, required: true }) planType = 'STANDARD'
  @Property({ type: String }) standardCode = /** @type {String} */ (null)
  @Property({ type: String }) inspectionLevel = /** @type {String} */ (null)
  // Z1.4 switching state (selects the AQL table); distinct from defect class.
  @Property({ type: String }) switchingState = 'NORMAL'
  // [{ severity: CRITICAL|MAJOR|MINOR, aql }] — AQL per defect class.
  @Property({ type: Object }) severityAqls = /** @type {Object} */ (null)
  @Property({ type: Object }) customPlanTable = /** @type {Object} */ (null)
  // In-process (IPQC) advisory guidance.
  @Property({ type: Number }) perCollectionSize = /** @type {Number} */ (null)
  @Property({ type: Number }) collectionIntervalMinutes = /** @type {Number} */ (null)
  @Property({ type: String }) statusId = 'DRAFT'
  @Property({ type: Number }) version = 1
  @Property({ type: String }) parentPlanId = /** @type {String} */ (null)
  @Property({ type: DateTime }) effectiveFrom = null
  @Property({ type: DateTime }) effectiveUntil = null
  @Property({ type: String }) approvedByUserId = /** @type {String} */ (null)
  @Property({ type: DateTime }) approvedAt = null
  @Property({ type: String }) signatureId = /** @type {String} */ (null)
  @Property({ type: String }) notes = /** @type {String} */ (null)
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
