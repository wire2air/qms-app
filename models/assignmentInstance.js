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

  @Property({ type: String }) statusId = 'DUE'

  @Property({ type: String }) completedRecordId = ''
  @Property({ type: DateTime }) completedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) missedAt = /** @type {DateTime} */ (null)

  @Property({ type: DateTime }) skippedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) skippedByUserId = ''
  @Property({ type: String }) skippedReason = ''

  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
