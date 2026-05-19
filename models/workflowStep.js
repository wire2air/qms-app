import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('workflowSteps', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'workflowVersionId, parentStepId',
})
export class WorkflowStep extends BaseModel {
  static paranoid = true // Enable soft deletes using deletedAt field
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
  @Property({ type: String, required: true }) workflowVersionId = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = ''
  @Property({ type: Number, required: true }) stepOrder = 0
  @Property({ type: String, required: true }) approvalRule = 'ALL'
  @Property({ type: Number }) slaDays = 10
  @Property({ type: Boolean }) requireComments = false
  @Property({ type: Boolean }) requireEsignature = false
  @Property({ type: Boolean }) allowChildSteps = false
  @Property({ type: Array }) formSchema = /** @type {Array} */ ([])
  @Property({ type: String }) parentStepId = /** @type {String} */ (null)
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
