import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('ncRecords', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'taskInstanceId, ncId, workflowInstanceStepId',
})
export class NcRecord extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.userId) this.userId = currentSession.value?.userId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) ncId = ''
  @Property({ type: String, required: true }) workflowInstanceStepId = ''
  // Nullable since migration 20260818000100: a step-form DRAFT can be saved
  // before its step activates, and a task only exists once it does. The
  // database still guarantees the binding for anything submitted —
  // CHECK (submitted_at IS NULL OR task_instance_id IS NOT NULL).
  @Property({ type: String }) taskInstanceId = null
  @Property({ type: String, required: true }) userId = ''
  @Property({ type: Object }) payload = {}
  @Property({ type: DateTime }) submittedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
}
