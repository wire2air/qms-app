import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property, ValidationError } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('workflowInstanceSteps', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: '[workflowInstanceId+statusId], workflowInstanceId, parentInstanceStepId',
})
export class WorkflowInstanceStep extends BaseModel {
  constructor(...args) {
    super(...args)
    // Auto-assign companyId from current session on creation
    if (!this.companyId) {
      this.companyId = currentSession.value?.companyId || ''
    }

    if (!this.id) {
      this.id = crypto.randomUUID()
    }
  }
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) workflowInstanceId = ''
  @Property({ type: Number, required: true }) stepNumber = 0
  @Property({ type: Number }) stepOrder = 0
  @Property({ type: String }) stepId = /** @type {string|null} */ (null)
  @Property({ type: String }) parentInstanceStepId = /** @type {string|null} */ (null)
  @Property({ type: String }) name = /** @type {string|null} */ (null)
  @Property({ type: String }) description = /** @type {string|null} */ (null)
  @Property({ type: Number }) slaDays = /** @type {number|null} */ (null)
  @Property({ type: Array }) formSchema = /** @type {Array} */ ([])
  @Property({ type: DateTime }) startedAt = null
  @Property({ type: DateTime }) completedAt = null
  @Property({ type: String, required: true }) statusId = 'PENDING'
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String }) sentBackToStepId = /**@type {string|null} */ (null)
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)

  async save() {
    // If the step is being marked as SENT_BACK, ensure sentBackToStepId is set
    if (this.statusId === 'SENT_BACK' && !this.sentBackToStepId) {
      throw new ValidationError([
        { field: 'sentBackToStepId', message: 'must be set when statusId is SENT_BACK' },
      ])
    }

    await super.save()
  }
}
