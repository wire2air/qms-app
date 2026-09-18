/**
 * Reordering workflow steps without violating uq_workflow_steps_version_order.
 *
 * That index is UNIQUE on (workflow_version_id, step_order) WHERE deleted_at
 * IS NULL, so ANY in-place renumber collides part-way through. The old swap
 * did exactly that and concurrently, so the write was rejected and nothing
 * persisted — and it presented differently per module: CAPA renders a computed
 * that re-sorts on the reactive mutation, so the row appeared to move before
 * silently failing to save, while NC's flat list didn't move at all. Both were
 * broken. (Reported 2026-08-16 as "move doesn't work on NC but works on CAPA".)
 */
import { describe, it, expect } from 'vitest'
import {
  reorderedSteps,
  movedIdOrder,
  parkingBase,
} from '../components/workflow/workflowStepOrder.js'

const steps = (...n) => n.map((i) => ({ id: `s${i}`, stepOrder: i }))
const ids = (arr) => arr.map((s) => s.id)

describe('movedIdOrder', () => {
  it('moves an item down', () => {
    expect(movedIdOrder(steps(1, 2, 3), 0, 2)).toEqual(['s2', 's3', 's1'])
  })

  it('moves an item up', () => {
    expect(movedIdOrder(steps(1, 2, 3), 2, 0)).toEqual(['s3', 's1', 's2'])
  })

  it('is a no-op for the same index or out of range', () => {
    expect(movedIdOrder(steps(1, 2), 1, 1)).toEqual(['s1', 's2'])
    expect(movedIdOrder(steps(1, 2), 5, 0)).toEqual(['s1', 's2'])
    expect(movedIdOrder(steps(1, 2), 0, -1)).toEqual(['s1', 's2'])
  })
})

describe('reorderedSteps', () => {
  it('orders by the given ids', () => {
    expect(ids(reorderedSteps(steps(1, 2, 3), ['s3', 's1', 's2']))).toEqual(['s3', 's1', 's2'])
  })

  it('keeps steps the caller did not mention rather than dropping them', () => {
    // A stale id list must never silently delete a step from the order.
    expect(ids(reorderedSteps(steps(1, 2, 3), ['s3']))).toEqual(['s3', 's1', 's2'])
  })

  it('ignores ids that no longer exist', () => {
    expect(ids(reorderedSteps(steps(1, 2), ['s9', 's2', 's1']))).toEqual(['s2', 's1'])
  })

  it('handles empty input', () => {
    expect(reorderedSteps([], [])).toEqual([])
    expect(reorderedSteps(undefined, undefined)).toEqual([])
  })
})

describe('parkingBase', () => {
  it('sits above every live order so pass one cannot collide', () => {
    // The parked band must clear the highest existing order, or parking step 1
    // lands on a row pass two hasn't moved yet.
    expect(parkingBase(steps(1, 2, 3))).toBe(4)
    expect(parkingBase([{ stepOrder: 7 }, { stepOrder: 2 }])).toBe(8)
  })

  it('tolerates missing or null orders', () => {
    expect(parkingBase([{ stepOrder: null }, { stepOrder: undefined }])).toBe(1)
    expect(parkingBase([])).toBe(1)
    expect(parkingBase(undefined)).toBe(1)
  })
})
