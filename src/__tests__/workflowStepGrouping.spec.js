/**
 * Which consecutive steps collapse into one card.
 *
 * The rules here mirror stepGroupIneligibleReason() in the backend's
 * workflowStepGroupService. The server is the authority — it recomputes and
 * refuses a call it disagrees with — so a mistake here cannot complete a step
 * that shouldn't be. It can, though, render a Complete button the server will
 * reject, which is why the two must be kept in step.
 *
 * The failure that matters most is over-grouping: a step swept into a run is
 * completed without its own deliberate act, and for an APPROVAL that would mean
 * an attestation nobody consciously gave.
 */
import { describe, it, expect } from 'vitest'
import {
  buildStepGroups,
  collapsedStepIds,
  isGroupableStep,
  STEP_GROUPING_ENABLED,
} from '../composables/useWorkflowStepGrouping.js'

const ME = 'user-me'
const OTHER = 'user-other'

const step = (n, over = {}) => ({
  id: `s${n}`,
  stepNumber: n,
  stepType: 'ACTION',
  statusId: 'PENDING',
  ...over,
})

/** Default context: every step is mine, single-assignee, no sub-tasks. */
function ctx(over = {}) {
  return {
    userId: ME,
    assigneesFor: () => [ME],
    openChildrenFor: () => 0,
    enabled: true,
    ...over,
  }
}

describe('isGroupableStep', () => {
  it('accepts a single-assignee ACTION step owned by the user', () => {
    expect(isGroupableStep(step(1), ME, [ME], 0)).toBe(true)
  })

  it('refuses APPROVAL — a gate is its own attestation', () => {
    expect(isGroupableStep(step(1, { stepType: 'APPROVAL' }), ME, [ME], 0)).toBe(false)
  })

  it('refuses DELAY — it parks until its due date and cannot complete inline', () => {
    expect(isGroupableStep(step(1, { stepType: 'DELAY' }), ME, [ME], 0)).toBe(false)
  })

  it('refuses a step with open sub-tasks', () => {
    expect(isGroupableStep(step(1), ME, [ME], 1)).toBe(false)
  })

  it('refuses a multi-assignee step — ALL/ANY is not one person acting', () => {
    expect(isGroupableStep(step(1), ME, [ME, OTHER], 0)).toBe(false)
  })

  it("refuses someone else's step", () => {
    expect(isGroupableStep(step(1), ME, [OTHER], 0)).toBe(false)
  })

  it('refuses a step with no assignee at all', () => {
    expect(isGroupableStep(step(1), ME, [], 0)).toBe(false)
  })
})

describe('buildStepGroups', () => {
  it('groups a run of consecutive steps behind the active one', () => {
    const steps = [step(1, { statusId: 'IN_PROGRESS' }), step(2), step(3)]
    const groups = buildStepGroups(steps, ctx())
    expect([...groups.keys()]).toEqual(['s1'])
    expect(groups.get('s1').map((s) => s.id)).toEqual(['s1', 's2', 's3'])
  })

  it('stops the run at the first step belonging to someone else', () => {
    const steps = [step(1, { statusId: 'IN_PROGRESS' }), step(2), step(3), step(4)]
    const groups = buildStepGroups(
      steps,
      ctx({ assigneesFor: (id) => (id === 's3' ? [OTHER] : [ME]) }),
    )
    expect(groups.get('s1').map((s) => s.id)).toEqual(['s1', 's2'])
  })

  it('stops at an APPROVAL rather than swallowing it', () => {
    const steps = [
      step(1, { statusId: 'IN_PROGRESS' }),
      step(2),
      step(3, { stepType: 'APPROVAL' }),
      step(4),
    ]
    const groups = buildStepGroups(steps, ctx())
    expect(groups.get('s1').map((s) => s.id)).toEqual(['s1', 's2'])
  })

  it('does not group when only the active step qualifies', () => {
    const steps = [step(1, { statusId: 'IN_PROGRESS' }), step(2, { stepType: 'APPROVAL' })]
    expect(buildStepGroups(steps, ctx()).size).toBe(0)
  })

  it('needs an IN_PROGRESS head — a run of PENDING steps has nothing to click', () => {
    const steps = [step(1), step(2), step(3)]
    expect(buildStepGroups(steps, ctx()).size).toBe(0)
  })

  it('will not pull in a step that is already in flight or terminal', () => {
    for (const status of ['IN_PROGRESS', 'SENT_BACK', 'APPROVED', 'SKIPPED', 'CHANGES_REQUESTED']) {
      const steps = [step(1, { statusId: 'IN_PROGRESS' }), step(2, { statusId: status })]
      expect(buildStepGroups(steps, ctx()).size, status).toBe(0)
    }
  })

  it('orders by stepNumber regardless of input order', () => {
    const steps = [step(3), step(1, { statusId: 'IN_PROGRESS' }), step(2)]
    expect(
      buildStepGroups(steps, ctx())
        .get('s1')
        .map((s) => s.id),
    ).toEqual(['s1', 's2', 's3'])
  })

  it('assigns a step to at most one run', () => {
    const steps = [
      step(1, { statusId: 'IN_PROGRESS' }),
      step(2),
      step(3, { statusId: 'IN_PROGRESS' }),
    ]
    const groups = buildStepGroups(steps, ctx())
    const all = [...groups.values()].flat().map((s) => s.id)
    expect(new Set(all).size).toBe(all.length)
  })

  it('forms nothing when the feature is switched off', () => {
    const steps = [step(1, { statusId: 'IN_PROGRESS' }), step(2), step(3)]
    expect(buildStepGroups(steps, ctx({ enabled: false })).size).toBe(0)
  })

  it('is inert without a user, and on empty or single-step lists', () => {
    const steps = [step(1, { statusId: 'IN_PROGRESS' }), step(2)]
    expect(buildStepGroups(steps, ctx({ userId: null })).size).toBe(0)
    expect(buildStepGroups([], ctx()).size).toBe(0)
    expect(buildStepGroups([step(1, { statusId: 'IN_PROGRESS' })], ctx()).size).toBe(0)
    expect(buildStepGroups(undefined, ctx()).size).toBe(0)
  })
})

describe('collapsedStepIds', () => {
  it('hides the tail of each run but never its head', () => {
    const steps = [step(1, { statusId: 'IN_PROGRESS' }), step(2), step(3)]
    const collapsed = collapsedStepIds(buildStepGroups(steps, ctx()))
    expect(collapsed.has('s1')).toBe(false)
    expect([...collapsed].sort()).toEqual(['s2', 's3'])
  })

  it('hides nothing when there are no runs', () => {
    expect(collapsedStepIds(new Map()).size).toBe(0)
  })
})

describe('the off switch', () => {
  it('is a plain boolean one edit can flip', () => {
    expect(typeof STEP_GROUPING_ENABLED).toBe('boolean')
  })
})
