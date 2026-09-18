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
  @Property({ type: String, required: true }) stepType = 'ACTION'
  @Property({ type: Number }) slaDays = 10
  // DELAY steps: days to wait after the previous step before activating.
  @Property({ type: Number }) delayDays = /** @type {Number} */ (null)
  // DELAY steps: fixed activation date — wins over delayDays when set.
  @Property({ type: DateTime }) delayUntilDate = /** @type {DateTime} */ (null)
  // DELAY steps: how many times the wake-up can be pushed out (null = 1).
  @Property({ type: Number }) maxDelayExtensions = /** @type {Number} */ (null)
  // Fixed deadline — wins over slaDays at activation (resolveStepDueDate).
  @Property({ type: DateTime }) dueDate = /** @type {DateTime} */ (null)
  // DELAY steps: does this step record an effectiveness verdict on completion?
  @Property({ type: Boolean }) capturesEffectiveness = false
  @Property({ type: Boolean }) requireComments = false
  @Property({ type: Boolean }) requireEsignature = false
  @Property({ type: Boolean }) allowChildSteps = false
  @Property({ type: Boolean }) externalSupplier = false
  @Property({ type: Boolean }) adobeEsignRequired = false
  @Property({ type: Array }) formSchema = /** @type {Array} */ ([])
  @Property({ type: String }) parentStepId = /** @type {String} */ (null)
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
