import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('workflowInstances', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: '[workflowVersionId+statusId], workflowVersionId, [resourceType+resourceId]',
})
export class WorkflowInstance extends BaseModel {
  // F-24 — `deletedAt` is declared below and `workflow_instances.deleted_at`
  // exists, but without this flag `BaseModel.paranoid` stays false: `.delete()`
  // would emit a hard DELETE mutation instead of stamping `deletedAt`, and
  // queries would keep returning soft-deleted rows.
  static paranoid = true

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
  @Property({ type: String, required: true }) resourceType = ''
  @Property({ type: String, required: true }) resourceId = ''
  @Property({ type: String, required: true }) workflowVersionId = ''
  @Property({ type: String, required: true }) statusId = 'IN_PROGRESS'
  @Property({ type: Number, required: true }) currentStep = 1
  @Property({ type: DateTime }) startedAt = null
  @Property({ type: DateTime }) completedAt = null
  // Effectiveness rollup — trigger-maintained server-side (2026-08-28); lists
  // and reports read these instead of digging workflow_instance_steps.
  @Property({ type: String }) effectivenessState = 'NONE'
  @Property({ type: DateTime }) effectivenessDueAt = null
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) submittedBy = ''
  @Property({ type: String }) comment = ''
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
