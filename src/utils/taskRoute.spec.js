import { describe, it, expect } from 'vitest'
import { resolveTaskInstanceRoute } from './taskRoute.js'

// QA #15 — a "task assigned" notification stores resourceType='TaskInstance',
// but there is no /task-instances/:id detail route (it 404s). The notification
// (and the task inbox) must resolve a TaskInstance to its HOST entity route.
// resolveTaskInstanceRoute returns a RAW path (caller wraps with getCompanyPath).

// Minimal fake db: each model exposes findByPk(id) -> row (or undefined).
function fakeDb(overrides = {}) {
  const model = (rows) => ({ findByPk: async (id) => rows[id] })
  return {
    DocumentVersion: model(overrides.DocumentVersion || {}),
    LogBookVersion: model(overrides.LogBookVersion || {}),
    AuditStandardVersion: model(overrides.AuditStandardVersion || {}),
    TrainingAssignee: model(overrides.TrainingAssignee || {}),
    AssignmentInstance: model(overrides.AssignmentInstance || {}),
    FormAssignment: model(overrides.FormAssignment || {}),
  }
}

describe('resolveTaskInstanceRoute', () => {
  it('maps direct-id entity types straight to their page', async () => {
    const db = fakeDb()
    expect(await resolveTaskInstanceRoute(db, { entityType: 'Nonconformance', entityId: 'nc1' })).toBe(
      '/nonconformances/nc1',
    )
    expect(await resolveTaskInstanceRoute(db, { entityType: 'Capa', entityId: 'c1' })).toBe('/capas/c1')
    expect(
      await resolveTaskInstanceRoute(db, { entityType: 'ChangeRequest', entityId: 'cr1' }),
    ).toBe('/change-requests/cr1')
    expect(
      await resolveTaskInstanceRoute(db, { entityType: 'AuditInstance', entityId: 'a1' }),
    ).toBe('/audits/instances/a1')
    expect(await resolveTaskInstanceRoute(db, { entityType: 'InspectionLot', entityId: 'l1' })).toBe(
      '/qc-inspection/lots/l1',
    )
    expect(
      await resolveTaskInstanceRoute(db, { entityType: 'TrainingInstance', entityId: 't1' }),
    ).toBe('/training-verifications/t1')
    expect(await resolveTaskInstanceRoute(db, { entityType: 'Document', entityId: 'd1' })).toBe(
      '/documents/d1',
    )
    expect(await resolveTaskInstanceRoute(db, { entityType: 'FieldRecord', entityId: 'f1' })).toBe(
      '/inspections-logs/records?recordId=f1',
    )
  })

  it('resolves a DocumentVersion to its parent document', async () => {
    const db = fakeDb({ DocumentVersion: { v1: { documentId: 'doc9' } } })
    expect(
      await resolveTaskInstanceRoute(db, { entityType: 'DocumentVersion', entityId: 'v1' }),
    ).toBe('/documents/doc9')
  })

  it('resolves a LogBookVersion / AuditStandardVersion / TrainingAssignee to their parents', async () => {
    const db = fakeDb({
      LogBookVersion: { lv1: { logBookId: 'lb1' } },
      AuditStandardVersion: { av1: { auditStandardId: 'as1' } },
      TrainingAssignee: { ta1: { trainingInstanceId: 'ti1' } },
    })
    expect(
      await resolveTaskInstanceRoute(db, { entityType: 'LogBookVersion', entityId: 'lv1' }),
    ).toBe('/inspections-logs/log-books/lb1')
    expect(
      await resolveTaskInstanceRoute(db, { entityType: 'AuditStandardVersion', entityId: 'av1' }),
    ).toBe('/audits/standards/as1')
    expect(
      await resolveTaskInstanceRoute(db, { entityType: 'TrainingAssignee', entityId: 'ta1' }),
    ).toBe('/my-training/ti1')
  })

  it('resolves an AssignmentInstance to the log-book fill URL', async () => {
    const db = fakeDb({
      AssignmentInstance: { ai1: { formAssignmentId: 'fa1' } },
      FormAssignment: { fa1: { logBookId: 'lb7' } },
    })
    expect(
      await resolveTaskInstanceRoute(db, { entityType: 'AssignmentInstance', entityId: 'ai1' }),
    ).toBe('/inspections-logs/fill?logBookId=lb7&assignmentInstanceId=ai1')
  })

  it('falls back to the task inbox for RFI, unmapped types, missing parents, and null task', async () => {
    const db = fakeDb({ DocumentVersion: {} })
    // Information-request source
    expect(
      await resolveTaskInstanceRoute(db, { sourceType: 'InformationRequest', entityType: 'Capa' }),
    ).toBe('/task-instances')
    // Unknown entity type
    expect(await resolveTaskInstanceRoute(db, { entityType: 'Mystery', entityId: 'x' })).toBe(
      '/task-instances',
    )
    // Versioned type whose parent row is missing
    expect(
      await resolveTaskInstanceRoute(db, { entityType: 'DocumentVersion', entityId: 'gone' }),
    ).toBe('/task-instances')
    // No task at all
    expect(await resolveTaskInstanceRoute(db, null)).toBe('/task-instances')
  })
})
