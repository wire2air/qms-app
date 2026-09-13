import { describe, it, expect, vi } from 'vitest'
import { resolveTaskInstanceRoute } from './taskRoute.js'

// QA #15 (pre-existing coverage, from the notifications work that first hit
// this "no /task-instances/:id detail route" gap) already pinned every branch
// here. Docs/modules/dashboard's 19-production-readiness.md listed this as its
// #1 recommended first test ("cheapest, highest-leverage... R3") on the
// assumption it had zero coverage — ALREADY FIXED, not a live gap; see the
// 2026-09-07 addendum. Restructured with it.each for the direct-id cases and
// one addition: pinning the console.warn on an unregistered entityType, so a
// future missing case (both here AND in the backend's entityRouteSegment,
// per the function's own doc comment) is loud instead of silently absorbed
// into the inbox fallback. `db` is a plain parameter (not the module-level
// syncEngine import), so no @models/index mock is needed.

function fakeDb(overrides = {}) {
  return {
    DocumentVersion: { findByPk: vi.fn(async () => null) },
    AuditStandardVersion: { findByPk: vi.fn(async () => null) },
    TrainingAssignee: { findByPk: vi.fn(async () => null) },
    AssignmentInstance: { findByPk: vi.fn(async () => null) },
    FormAssignment: { findByPk: vi.fn(async () => null) },
    ...overrides,
  }
}

describe('resolveTaskInstanceRoute', () => {
  it('falls back to the task inbox for a null task', async () => {
    expect(await resolveTaskInstanceRoute(fakeDb(), null)).toBe('/task-instances')
  })

  it('an InformationRequest (RFI) task always goes to the inbox, regardless of entityType', async () => {
    const t = { sourceType: 'InformationRequest', entityType: 'Nonconformance', entityId: 'x' }
    expect(await resolveTaskInstanceRoute(fakeDb(), t)).toBe('/task-instances')
  })

  it.each([
    ['Nonconformance', '/nonconformances/e1'],
    ['Capa', '/capas/e1'],
    ['ChangeRequest', '/change-requests/e1'],
    ['AuditInstance', '/audits/instances/e1'],
    ['InspectionLot', '/qc-inspection/lots/e1'],
    ['TrainingInstance', '/training-verifications/e1'],
    ['Document', '/documents/e1'],
    ['LogBook', '/inspections-logs/log-books/e1'],
    ['FieldRecord', '/inspections-logs/records?recordId=e1'],
  ])('%s resolves directly off entityId', async (entityType, expected) => {
    const t = { entityType, entityId: 'e1' }
    expect(await resolveTaskInstanceRoute(fakeDb(), t)).toBe(expected)
  })

  it('DocumentVersion resolves the parent document id', async () => {
    const db = fakeDb({
      DocumentVersion: { findByPk: vi.fn(async () => ({ documentId: 'doc-1' })) },
    })
    const t = { entityType: 'DocumentVersion', entityId: 'v1' }
    expect(await resolveTaskInstanceRoute(db, t)).toBe('/documents/doc-1')
  })

  it('DocumentVersion falls back to the inbox when the version no longer resolves', async () => {
    const db = fakeDb({ DocumentVersion: { findByPk: vi.fn(async () => null) } })
    const t = { entityType: 'DocumentVersion', entityId: 'gone' }
    expect(await resolveTaskInstanceRoute(db, t)).toBe('/task-instances')
  })

  it('AuditStandardVersion resolves the parent standard id', async () => {
    const db = fakeDb({
      AuditStandardVersion: { findByPk: vi.fn(async () => ({ auditStandardId: 'std-1' })) },
    })
    const t = { entityType: 'AuditStandardVersion', entityId: 'v1' }
    expect(await resolveTaskInstanceRoute(db, t)).toBe('/audits/standards/std-1')
  })

  it('TrainingAssignee resolves the parent training instance id', async () => {
    const db = fakeDb({
      TrainingAssignee: { findByPk: vi.fn(async () => ({ trainingInstanceId: 'ti-1' })) },
    })
    const t = { entityType: 'TrainingAssignee', entityId: 'a1' }
    expect(await resolveTaskInstanceRoute(db, t)).toBe('/my-training/ti-1')
  })

  it('AssignmentInstance resolves through its FormAssignment to the log book fill route', async () => {
    const db = fakeDb({
      AssignmentInstance: { findByPk: vi.fn(async () => ({ formAssignmentId: 'fa-1' })) },
      FormAssignment: { findByPk: vi.fn(async () => ({ logBookId: 'lb-1' })) },
    })
    const t = { entityType: 'AssignmentInstance', entityId: 'ai-1' }
    expect(await resolveTaskInstanceRoute(db, t)).toBe(
      '/inspections-logs/fill?logBookId=lb-1&assignmentInstanceId=ai-1',
    )
  })

  it('AssignmentInstance falls back to the inbox when the plan has no log book', async () => {
    const db = fakeDb({
      AssignmentInstance: { findByPk: vi.fn(async () => ({ formAssignmentId: 'fa-1' })) },
      FormAssignment: { findByPk: vi.fn(async () => null) },
    })
    const t = { entityType: 'AssignmentInstance', entityId: 'ai-1' }
    expect(await resolveTaskInstanceRoute(db, t)).toBe('/task-instances')
  })

  it('an unregistered entityType falls back to the inbox and warns loudly (not silently)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const t = { entityType: 'SomeFutureEntity', entityId: 'x' }
    expect(await resolveTaskInstanceRoute(fakeDb(), t)).toBe('/task-instances')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SomeFutureEntity'))
    warnSpy.mockRestore()
  })
})
