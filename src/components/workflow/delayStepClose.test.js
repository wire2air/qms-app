import { describe, it, expect } from 'vitest'
import { countStepsBlockingClose, isSupersededStep, stepBlocksClose } from './delayStepClose.js'

const row = (o) => ({ id: o.id, workflowInstanceId: 'wi-1', stepId: 's-approval', stepNumber: 3, stepType: 'APPROVAL', statusId: 'PENDING', delayUntil: null, ...o })

describe('delayStepClose', () => {
  it('terminal steps never block; live ones do', () => {
    for (const statusId of ['APPROVED', 'SKIPPED', 'CANCELLED']) expect(stepBlocksClose(row({ id: 'a', statusId }))).toBe(false)
    for (const statusId of ['PENDING', 'IN_PROGRESS', 'SENT_BACK', 'REJECTED']) expect(stepBlocksClose(row({ id: 'a', statusId }))).toBe(true)
  })

  it('a deferred delay step does not block; an unscheduled one does', () => {
    expect(stepBlocksClose(row({ id: 'a', stepType: 'DELAY', statusId: 'IN_PROGRESS' }))).toBe(false)
    expect(stepBlocksClose(row({ id: 'a', stepType: 'DELAY', statusId: 'SCHEDULED', delayUntil: {} }))).toBe(false)
    expect(stepBlocksClose(row({ id: 'a', stepType: 'DELAY', statusId: 'SCHEDULED', delayUntil: null }))).toBe(true)
  })

  it('a sent-back gate stops blocking once its re-run row exists', () => {
    const old = row({ id: 'old', statusId: 'SENT_BACK', stepNumber: 3 })
    const steps = [row({ id: 'inv', stepId: 's-inv', stepNumber: 1, statusId: 'APPROVED' }), old, row({ id: 'new', statusId: 'APPROVED', stepNumber: 6 })]
    expect(isSupersededStep(old, steps)).toBe(true)
    expect(countStepsBlockingClose(steps)).toBe(0)
    // Re-run still pending: the pending row blocks, the old one no longer double-counts.
    expect(countStepsBlockingClose([old, row({ id: 'new', statusId: 'PENDING', stepNumber: 6 })])).toBe(1)
  })

  it('a closed gate is superseded only by a LATER row of the same step in the same instance', () => {
    const g = row({ id: 'g', statusId: 'REJECTED', stepNumber: 3 })
    expect(isSupersededStep(g, [g, row({ id: 'x', stepId: 'other', stepNumber: 9 })])).toBe(false)
    expect(isSupersededStep(g, [g, row({ id: 'x', workflowInstanceId: 'wi-2', stepNumber: 9 })])).toBe(false)
    expect(isSupersededStep(g, [g, row({ id: 'x', stepNumber: 2 })])).toBe(false)
    expect(isSupersededStep(row({ id: 'a', stepId: null, statusId: 'SENT_BACK' }), [row({ id: 'b', stepId: null, stepNumber: 9 })])).toBe(false)
  })
})
