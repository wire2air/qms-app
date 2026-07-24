import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * InspectionLotEvent — the domain audit trail for significant lot actions
 * (currently REOPENED: a QA manager reopening a failed / under-review lot for
 * re-inspection under a different spec / sampling plan). Read-only in the UI
 * (server-written); rendered as a history timeline on the lot detail. The lot's
 * recorded results are kept on reopen; this is the audit record of the action.
 */
@ClientModel('inspectionLotEvents', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'inspectionLotId',
})
export class InspectionLotEvent extends BaseModel {
  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) inspectionLotId = ''
  @Property({ type: String, required: true }) eventType = ''
  @Property({ type: String }) actorUserId = /** @type {String} */ (null)
  @Property({ type: String }) reason = /** @type {String} */ (null)
  @Property({ type: String }) fromStatus = /** @type {String} */ (null)
  @Property({ type: String }) toStatus = /** @type {String} */ (null)
  @Property({ type: String }) fromSpecificationId = /** @type {String} */ (null)
  @Property({ type: String }) toSpecificationId = /** @type {String} */ (null)
  @Property({ type: String }) fromSamplingPlanId = /** @type {String} */ (null)
  @Property({ type: String }) toSamplingPlanId = /** @type {String} */ (null)
  @Property({ type: Object }) payload = /** @type {Object} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
