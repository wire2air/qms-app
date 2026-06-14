import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('esignAgreements', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'resourceId, workflowInstanceStepId',
})
export class EsignAgreement extends BaseModel {
  static paranoid = true
  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String }) workflowInstanceId = /** @type {String} */ (null)
  @Property({ type: String }) workflowInstanceStepId = /** @type {String} */ (null)
  @Property({ type: String }) resourceType = 'DocumentVersion'
  @Property({ type: String, required: true }) resourceId = ''
  @Property({ type: String }) provider = 'ADOBE'
  @Property({ type: String }) adobeAgreementId = /** @type {String} */ (null)
  @Property({ type: String }) status = 'DRAFT'
  @Property({ type: String }) sourceAssetId = /** @type {String} */ (null)
  @Property({ type: String }) signedAssetId = /** @type {String} */ (null)
  @Property({ type: String }) error = /** @type {String} */ (null)
  @Property({ type: DateTime }) sentAt = null
  @Property({ type: DateTime }) completedAt = null
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
