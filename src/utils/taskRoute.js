/**
 * Resolve the in-app deep link for a TaskInstance's host entity.
 *
 * A TaskInstance has no standalone detail route (`/task-instances/:id` does not
 * exist — that path 404s). The task inbox and the "task assigned" notification
 * therefore link to the task's HOST entity instead, mirroring the backend email
 * deep link (`entityRouteSegment` in `@qability/shared/utils/companyAppUrl`).
 *
 * Direct-id entity types map straight to their page; versioned types resolve the
 * parent id; RFI tasks and anything unmapped fall back to the task inbox.
 *
 * Returns a RAW path — callers wrap it with `getCompanyPath()`.
 *
 * @param {typeof import('@models/index').db} db
 * @param {{ sourceType?: string, entityType?: string, entityId?: string }} t
 * @returns {Promise<string>}
 */
export async function resolveTaskInstanceRoute(db, t) {
  if (!t) return '/task-instances'
  if (t.sourceType === 'InformationRequest') return '/task-instances'
  switch (t.entityType) {
    case 'Nonconformance':
      return `/nonconformances/${t.entityId}`
    case 'Capa':
      return `/capas/${t.entityId}`
    case 'ChangeRequest':
      return `/change-requests/${t.entityId}`
    case 'AuditInstance':
      return `/audits/instances/${t.entityId}`
    case 'InspectionLot':
      return `/qc-inspection/lots/${t.entityId}`
    case 'TrainingInstance':
      return `/training-verifications/${t.entityId}`
    case 'DocumentVersion': {
      const v = await db.DocumentVersion.findByPk(t.entityId)
      return v?.documentId ? `/documents/${v.documentId}` : '/task-instances'
    }
    case 'Document':
      return `/documents/${t.entityId}`
    case 'LogBookVersion': {
      const v = await db.LogBookVersion.findByPk(t.entityId)
      return v?.logBookId ? `/inspections-logs/log-books/${v.logBookId}` : '/task-instances'
    }
    case 'AuditStandardVersion': {
      const v = await db.AuditStandardVersion.findByPk(t.entityId)
      return v?.auditStandardId ? `/audits/standards/${v.auditStandardId}` : '/task-instances'
    }
    case 'TrainingAssignee': {
      const a = await db.TrainingAssignee.findByPk(t.entityId)
      return a?.trainingInstanceId ? `/my-training/${a.trainingInstanceId}` : '/task-instances'
    }
    case 'AssignmentInstance': {
      const inst = await db.AssignmentInstance.findByPk(t.entityId)
      const plan = inst?.formAssignmentId
        ? await db.FormAssignment.findByPk(inst.formAssignmentId)
        : null
      return plan?.logBookId
        ? `/inspections-logs/fill?logBookId=${plan.logBookId}&assignmentInstanceId=${t.entityId}`
        : '/task-instances'
    }
    case 'FieldRecord':
      return `/inspections-logs/records?recordId=${t.entityId}`
    default:
      return '/task-instances'
  }
}
