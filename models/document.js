import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('documents', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'docNumber',
  schemaVersion: 2,
})
export class Document extends BaseModel {
  static paranoid = true // Enable soft deletes using deletedAt field

  constructor(...args) {
    super(...args)
    // Auto-assign companyId and userId from current session on creation
    if (!this.companyId) {
      this.companyId = currentSession.value?.companyId || ''
    }

    if (!this.userId) {
      this.userId = currentSession.value?.userId || ''
    }

    if (!this.id) {
      this.id = crypto.randomUUID()
    }
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) docNumber = ''
  @Property({ type: String, required: true }) title = ''
  @Property({ type: String }) departmentId = ''
  @Property({ type: String, required: true }) documentTypeId = ''
  @Property({ type: String }) documentTemplateId = ''
  @Property({ type: String, required: true }) userId = ''
  @Property({ type: String, required: true }) siteId = ''
  @Property({ type: String }) statusId = 'DRAFT'
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) workflowVersionId = ''
  @Property({ type: String, required: true }) prefix = ''
  @Property({ type: String }) relatedStandardId = ''
  @Property({ type: Number, required: true }) periodicReviewMonths = 12
  @Property({ type: Boolean }) autoEffectiveOnApproval = true
  @Property({ type: Object }) trainingConfig = null
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
}
