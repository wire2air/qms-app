import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('taskInstances', {
  primaryKey: 'id',
  loadStrategy: 'instant',
  syncField: 'updatedAt',
  customIndex: '[entityType+entityId], [sourceType+sourceId], assignedTo',
  schemaVersion: 2,
})
export class TaskInstance extends BaseModel {
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
  // ── Tasks F-04 / R-01 — the generated-mutation surface, narrowed ────────────
  //
  // This model was the only one of ten lifecycle siblings with NO
  // `excludeFromGraphQL` markers at all (assignmentInstance.js locks nine
  // fields; capa, nonconformance, changeRequest and the rest lock theirs), so
  // syncEngine generated a full update mutation for every column. Combined with
  // `task_instances_update_rls` asking no permission question, that made every
  // field of every task in the tenant writable from a browser console.
  //
  // What that reaches is not cosmetic: `signatures.task_instance_id` is in
  // `signatures_subject_exactly_one_chk`, so a task IS a Part-11 signature
  // subject. Repointing `entity_id` moves a signed approval onto a different
  // record; rewriting `assigned_to` forges who performed it.
  //
  // ── WHY statusId AND completedAt ARE DELIBERATELY LEFT OPEN ────────────────
  //
  // `DocumentCollaboratorTaskCard.vue:43-46` completes a collaboration task by
  // assigning both and calling `.save()`. It is the ONLY component in `src/`
  // that mutates a TaskInstance through the client model — verified by grepping
  // every `.save()`/`.destroy()` in every file referencing TaskInstance — and
  // locking these two would silently break it with no server endpoint to take
  // over. Closing that last pair means giving the collaboration flow a real
  // endpoint first; it is recorded as open rather than half-done here.
  //
  // So this is a deliberate partial lock: it removes the forging surface
  // (attribution, parent linkage, tenancy, tombstone) and leaves exactly the
  // two fields one known caller needs. The lifecycle trigger is the real gate.
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true, excludeFromGraphQL: ['update'] }) assignedTo = ''
  @Property({ type: String, required: true, excludeFromGraphQL: ['update'] }) taskKindId = ''
  // Left writable for DocumentCollaboratorTaskCard — see the note above.
  @Property({ type: String }) statusId = 'ASSIGNED'
  @Property({ type: String, required: true, excludeFromGraphQL: ['update'] }) priorityId = ''
  @Property({ type: DateTime, required: true, excludeFromGraphQL: ['update'] }) dueDate =
    /** @type {DateTime} */ (null)
  // Left writable for DocumentCollaboratorTaskCard — see the note above.
  @Property({ type: DateTime }) completedAt = null
  @Property({ type: String, required: true, excludeFromGraphQL: ['update'] }) entityType = ''
  @Property({ type: String, required: true, excludeFromGraphQL: ['update'] }) entityId = ''
  @Property({ type: String, required: true, excludeFromGraphQL: ['update'] }) sourceType = ''
  @Property({ type: String, required: true, excludeFromGraphQL: ['update'] }) sourceId = ''
  @Property({ type: String, excludeFromGraphQL: ['update'] }) reassignedToUserId = null
  // Reviewer's reject reason / approval note. Surfaced on the
  // WorkflowStep Activity panel and used by the parent entity's
  // status flip downstream. BE writes this on /rejectStepTask +
  // /taskInstances/<id>/action.
  @Property({ type: String, excludeFromGraphQL: ['update'] }) comment = ''
  @Property({ type: String, required: true, excludeFromGraphQL: ['update'] }) companyId = ''
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
