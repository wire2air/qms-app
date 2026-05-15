import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('capas', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, [sourceType+sourceId]',
  schemaVersion: 1,
})
export class Capa extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) {
      this.companyId = currentSession.value?.companyId || ''
    }
    if (!this.id) {
      this.id = crypto.randomUUID()
    }
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String }) capaNumber = ''
  @Property({ type: String, required: true }) title = ''
  @Property({ type: String }) description = ''
  @Property({ type: String }) statusId = 'DRAFT'
  @Property({ type: String, required: true }) priorityId = ''
  @Property({ type: String, required: true }) typeId = ''
  @Property({ type: String, required: true }) sourceType = ''
  @Property({ type: String, required: true }) siteId = ''
  @Property({ type: String, required: true }) departmentId = ''
  @Property({ type: String, required: true }) ownerId = ''
  @Property({ type: String }) workflowVersionId = /** @type {String} */ (null)
  @Property({ type: String }) sourceId = /** @type {String} */ (null)
  @Property({ type: DateTime }) initiatedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) dueDate = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) completedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) closedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) rootCauseCategoryId = null
  @Property({ type: String }) rootCause = ''
  @Property({ type: String }) correctiveAction = ''
  @Property({ type: String }) preventiveAction = ''
  @Property({ type: String }) effectivenessVerification = ''
  @Property({ type: DateTime }) verifiedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) verifiedBy = /** @type {String} */ (null)
  @Property({ type: Object }) effectivenessCheck = /** @type {Object} */ ({})
  @Property({ type: Object }) scheduledCycle = /** @type {Object} */ (null)
  @Property({ type: String, required: true }) createdBy = ''
  @Property({ type: String, required: true }) updatedBy = ''
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
}
