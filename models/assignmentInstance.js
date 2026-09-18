import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AssignmentInstance — one row per occurrence. The user's "queue" is
 *   db.AssignmentInstance.where('assignedToUserId', userId)
 *     .where('statusId', 'DUE') .or('OVERDUE') (composed via in-memory filter)
 *
 * Skipping or submitting routes through REST endpoints — direct
 * SyncEngine save is not the path, because the server has to also flip
 * statusId, write the audit row, and (for submit) link the
 * completedRecordId in the same transaction.
 */
@ClientModel('assignmentInstances', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'assignedToUserId, statusId, formAssignmentId',
})
export class AssignmentInstance extends BaseModel {
  static paranoid = true

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) formAssignmentId = ''
  @Property({ type: String, required: true }) assignedToUserId = ''

  @Property({ type: DateTime, required: true }) dueAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true }) windowOpensAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true }) windowClosesAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true }) graceUntil = /** @type {DateTime} */ (null)

  // The client half of inspections-logs finding #3. The RLS UPDATE policy
  // admitted the assignee with no permission at all, so the person the work was
  // assigned to could mark their own overdue occurrence COMPLETED, or erase a
  // MISSED one. Nothing in src/ mutates this entity at all — the UI completes an
  // occurrence indirectly, by passing `assignmentInstanceId` on a record submit
  // — so these markers cost nothing and close the generated mutation.
  // enforce_assignment_instance_lifecycle (20260901150000) is the real gate.
  @Property({ type: String, excludeFromGraphQL: ['update'] }) statusId = 'DUE'

  @Property({ type: String, excludeFromGraphQL: ['update'] }) completedRecordId = ''
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) completedAt =
    /** @type {DateTime} */ (null)
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) missedAt = /** @type {DateTime} */ (
    null
  )

  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) skippedAt =
    /** @type {DateTime} */ (null)
  @Property({ type: String, excludeFromGraphQL: ['update'] }) skippedByUserId = ''
  @Property({ type: String, excludeFromGraphQL: ['update'] }) skippedReason = ''

  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) deletedAt =
    /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
