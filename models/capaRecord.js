import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('capaRecords', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'taskInstanceId, capaId, workflowInstanceStepId',
})
export class CapaRecord extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.userId) this.userId = currentSession.value?.userId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) capaId = ''
  @Property({ type: String, required: true }) workflowInstanceStepId = ''
  @Property({ type: String, required: true }) taskInstanceId = ''
  @Property({ type: String, required: true }) stepId = ''
  @Property({ type: String, required: true }) userId = ''
  @Property({ type: Object }) payload = {}
  @Property({ type: DateTime }) submittedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
}
