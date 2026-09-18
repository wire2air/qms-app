/**
 * Acting on a step that is not assigned to you.
 *
 * The two things that must not regress: your OWN task always wins (so ordinary
 * work is never mislabelled as acting for someone else), and a takeover is only
 * ever offered when the matrix says so.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockIsAllowedOnRecord = vi.fn()
vi.mock('@/utils/currentSession.js', () => ({
  isAllowedOnRecord: (...a) => mockIsAllowedOnRecord(...a),
}))

const { pickActionableTask, permissionForStep, mayActOnStepType, onBehalfOfLabel } =
  await import('./stepTakeover.js')

const ME = 'user-me'
const THEM = 'user-them'
const mine = { id: 't-mine', assignedTo: ME, taskKindId: 'APPROVAL', statusId: 'ASSIGNED' }
const theirs = { id: 't-theirs', assignedTo: THEM, taskKindId: 'APPROVAL', statusId: 'ASSIGNED' }

beforeEach(() => mockIsAllowedOnRecord.mockReset())

describe('the verb is required of the assignee too', () => {
  it('withholds my OWN task when I do not hold the verb', () => {
    // The exemption that made `<module>:approve` meaningless: anyone can be
    // ASSIGNED an approval step, so if assignment granted the verb, the grant
    // gated nothing. Removed 2026-08-19, matching the record-owner rule.
    const r = pickActionableTask({ tasks: [mine], userId: ME, mayAct: false })
    expect(r).toMatchObject({ task: null, isTakeover: false })
  })

  it('still lets the assignee act where the matrix cannot be consulted', () => {
    // DocumentVersion / LogBook / InspectionLot have no scope inputs, so their
    // module carries no authzModule. Enforcing a verb we cannot evaluate would
    // strand every document approval.
    const r = pickActionableTask({
      tasks: [mine],
      userId: ME,
      mayAct: false,
      matrixApplies: false,
    })
    expect(r).toMatchObject({ task: mine, isTakeover: false })
  })

  it('gives a non-assignee nothing when the matrix does not apply', () => {
    const r = pickActionableTask({
      tasks: [theirs],
      userId: ME,
      mayAct: true,
      matrixApplies: false,
    })
    expect(r).toMatchObject({ task: null, isTakeover: false })
  })
})

describe('picking the task to act on', () => {
  it('prefers my own task even when I could take over', () => {
    // Otherwise my ordinary work would render as "on behalf of someone".
    const r = pickActionableTask({ tasks: [theirs, mine], userId: ME, mayAct: true })
    expect(r).toMatchObject({ task: mine, isTakeover: false })
  })

  it('offers someone else’s task only when the matrix allows it', () => {
    expect(pickActionableTask({ tasks: [theirs], userId: ME, mayAct: false })).toMatchObject({
      task: null,
      isTakeover: false,
    })
    expect(pickActionableTask({ tasks: [theirs], userId: ME, mayAct: true })).toMatchObject({
      task: theirs,
      isTakeover: true,
      assigneeId: THEM,
    })
  })

  it('ignores tasks that are not actionable', () => {
    const done = { ...theirs, statusId: 'APPROVED' }
    expect(pickActionableTask({ tasks: [done], userId: ME, mayAct: true }).task).toBeNull()
  })

  it('ignores tasks of another kind', () => {
    const other = { ...theirs, taskKindId: 'REVIEW' }
    expect(pickActionableTask({ tasks: [other], userId: ME, mayAct: true }).task).toBeNull()
  })

  it('does not treat an unassigned task as mine when I have no id', () => {
    // undefined === undefined would otherwise hand it over as "my own".
    const orphan = { ...theirs, assignedTo: null }
    const r = pickActionableTask({ tasks: [orphan], userId: undefined, mayAct: true })
    expect(r).toMatchObject({ task: null, isTakeover: false })
  })
})

describe('which permission a step demands', () => {
  it('needs approve for APPROVAL and update for the rest', () => {
    expect(permissionForStep('ncr', 'APPROVAL')).toBe('ncr:approve')
    expect(permissionForStep('ncr', 'ACTION')).toBe('ncr:update')
    expect(permissionForStep('ncr', 'DELAY')).toBe('ncr:update')
  })

  it('is null for a module with no authz id — assignee-only, as the server has it', () => {
    expect(permissionForStep(undefined, 'ACTION')).toBeNull()
    expect(mayActOnStepType({ module: {}, record: { id: 'r' }, stepType: 'ACTION' })).toBe(false)
    expect(mockIsAllowedOnRecord).not.toHaveBeenCalled()
  })

  it('asks the record-scoped check, not just the permission string', () => {
    mockIsAllowedOnRecord.mockReturnValue(true)
    const record = { id: 'nc1', ownerId: 'o', siteId: 's' }
    expect(mayActOnStepType({ module: { authzModule: 'ncr' }, record, stepType: 'APPROVAL' })).toBe(
      true,
    )
    expect(mockIsAllowedOnRecord).toHaveBeenCalledWith('ncr:approve', record)
  })

  it('is false before the record has loaded', () => {
    expect(
      mayActOnStepType({ module: { authzModule: 'ncr' }, record: null, stepType: 'ACTION' }),
    ).toBe(false)
  })
})

describe('the label', () => {
  it('names the assignee so the action cannot be taken without reading whose it is', () => {
    expect(onBehalfOfLabel('Approve', 'Sam Patel')).toBe('Approve on behalf of Sam Patel')
  })

  it('still says on-behalf-of when the name has not resolved', () => {
    expect(onBehalfOfLabel('Approve', null)).toBe('Approve on behalf of the assignee')
  })
})
