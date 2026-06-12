import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * Inspection Plan — binds a Specification + Sampling Plan + disposition
 * Workflow to a (product OR product type, inspection point). Lot creation
 * resolves through these so inspectors don't pick spec/sampling manually.
 */
@ClientModel('qcInspectionTemplates', { primaryKey: 'id', syncField: 'updatedAt', customIndex: 'inspectionPoint' })
export class QcInspectionTemplate extends BaseModel {
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
  @Property({ type: String, required: true }) inspectionPoint = 'INCOMING'
  @Property({ type: String }) productId = /** @type {String} */ (null)
  @Property({ type: String }) productTypeId = /** @type {String} */ (null)
  @Property({ type: String, required: true }) workflowVersionId = ''
  @Property({ type: String }) specificationId = /** @type {String} */ (null)
  @Property({ type: String }) samplingPlanId = /** @type {String} */ (null)
  @Property({ type: Object }) qualityStateTransitions = /** @type {Object} */ (null)
  @Property({ type: Boolean }) autoCreateNcOnReject = /** @type {Boolean} */ (null)
  @Property({ type: Array }) notifyGroupIdsOnPass = /** @type {Array} */ ([])
  @Property({ type: Array }) notifyGroupIdsOnFail = /** @type {Array} */ ([])
  @Property({ type: Number }) version = 1
  @Property({ type: Boolean }) active = true
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
