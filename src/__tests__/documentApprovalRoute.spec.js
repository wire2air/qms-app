/**
 * The document approval route strip's data shape.
 *
 * Two things are easy to get quietly wrong and invisible until someone is
 * looking at a wrong-coloured node on a live document:
 *
 *  - Nine instance-step statuses collapse onto four stepper states. SKIPPED
 *    must read as done (the route moved past it), and SENT_BACK must read as
 *    current (that step is exactly where the work now sits), not as an error.
 *  - A send-back re-instances a step, so the same template step has several
 *    rows. The route must show the newest one; showing an older row would
 *    report a step as already approved when it has been reopened.
 */
import { describe, it, expect } from 'vitest'
import { stepperStatus, routeSteps } from '../components/documents/documentApprovalRoute.js'

describe('stepperStatus', () => {
  it('treats APPROVED and SKIPPED as done', () => {
    expect(stepperStatus('APPROVED')).toBe('complete')
    // Skipped is not failure — the route passed through it.
    expect(stepperStatus('SKIPPED')).toBe('complete')
  })

  it('treats SENT_BACK and CHANGES_REQUESTED as where the work sits', () => {
    expect(stepperStatus('SENT_BACK')).toBe('current')
    expect(stepperStatus('CHANGES_REQUESTED')).toBe('current')
    expect(stepperStatus('IN_PROGRESS')).toBe('current')
    expect(stepperStatus('SCHEDULED')).toBe('current')
  })

  it('treats REJECTED and CANCELLED as a stopped route', () => {
    expect(stepperStatus('REJECTED')).toBe('error')
    expect(stepperStatus('CANCELLED')).toBe('error')
  })

  it('treats PENDING and anything unrecognised as not yet reached', () => {
    expect(stepperStatus('PENDING')).toBe('upcoming')
    expect(stepperStatus('SOMETHING_NEW')).toBe('upcoming')
    expect(stepperStatus(undefined)).toBe('upcoming')
  })
})

describe('routeSteps', () => {
  const step = (o) => ({ parentInstanceStepId: null, createdAt: 0, ...o })

  it('keeps only the newest row per template step after a send-back', () => {
    const rows = [
      step({ id: 'a1', stepId: 's1', stepOrder: 1, statusId: 'APPROVED', createdAt: 10 }),
      step({ id: 'a2', stepId: 's1', stepOrder: 1, statusId: 'IN_PROGRESS', createdAt: 20 }),
    ]
    const out = routeSteps(rows)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('a2')
    expect(out[0].statusId).toBe('IN_PROGRESS')
  })

  it('orders by stepOrder regardless of input order', () => {
    const rows = [
      step({ id: 'b', stepId: 's2', stepOrder: 2 }),
      step({ id: 'a', stepId: 's1', stepOrder: 1 }),
    ]
    expect(routeSteps(rows).map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('drops sub-steps — they are runtime detail, not route nodes', () => {
    const rows = [
      step({ id: 'root', stepId: 's1', stepOrder: 1 }),
      step({ id: 'child', stepId: 's2', stepOrder: 2, parentInstanceStepId: 'root' }),
    ]
    expect(routeSteps(rows).map((s) => s.id)).toEqual(['root'])
  })

  it('keeps ad-hoc steps distinct even though they share a null stepId', () => {
    const rows = [
      step({ id: 'x', stepId: null, stepOrder: 1 }),
      step({ id: 'y', stepId: null, stepOrder: 2 }),
    ]
    expect(routeSteps(rows).map((s) => s.id)).toEqual(['x', 'y'])
  })

  it('handles an empty or missing list', () => {
    expect(routeSteps([])).toEqual([])
    expect(routeSteps(undefined)).toEqual([])
  })
})
