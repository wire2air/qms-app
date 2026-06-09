import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AuditRequirementResponse — per-requirement assessment captured
 * during the audit. One row per (instance, requirement).
 *
 * requirementSnapshot freezes the requirement question text at
 * response time so even after the standard is later edited, the audit
 * report shows what was asked.
 *
 * resultId values: CONFORMING / MINOR_NC / MAJOR_NC / OBSERVATION /
 * OFI / NA.
 */
@ClientModel('auditRequirementResponses', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, auditInstanceId, requirementId, resultId',
})
export class AuditRequirementResponse extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.assessedByUserId) this.assessedByUserId = currentSession.value?.userId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) auditInstanceId = ''
  @Property({ type: String }) requirementId = ''
  @Property({ type: Object }) requirementSnapshot = {}
  @Property({ type: String, required: true }) resultId = ''
  @Property({ type: String }) comments = ''
  // Guided audit (#23): per-question checklist + who was interviewed.
  @Property({ type: Object }) questionChecklist = {}
  @Property({ type: Object }) peopleInterviewed = []
  // Guided audit (#24): observation + evidence checklists { [id]: {checked,note} }.
  @Property({ type: Object }) observationChecklist = {}
  @Property({ type: Object }) evidenceChecklist = {}
  @Property({ type: String }) assessedByUserId = ''
  @Property({ type: DateTime }) assessedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
