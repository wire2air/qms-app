/**
 * Shared predicate for record-close gating: does a workflow instance step still
 * BLOCK the record from being closed? Mirrors the backend
 * countOpenStepsForClose (workflowInstanceService.js).
 *
 * A step blocks unless it is already terminal (APPROVED/SKIPPED/CANCELLED) or a
 * DEFERRED delay step — an effectiveness-check-style DELAY step that is allowed
 * to outlive the close and fire afterward. Deferred = a DELAY step that has
 * already fired (IN_PROGRESS) or is armed with a wake date (SCHEDULED +
 * delayUntil set). An awaiting-scheduling delay (SCHEDULED, no date) STILL
 * blocks — the owner must schedule or skip it first, or it would never fire.
 */
export function stepBlocksClose(step) {
  if (!step) return false
  if (['APPROVED', 'SKIPPED', 'CANCELLED'].includes(step.statusId)) return false
  if (step.stepType === 'DELAY') {
    if (step.statusId === 'IN_PROGRESS') return false
    if (step.statusId === 'SCHEDULED' && step.delayUntil) return false
  }
  return true
}

/** Count the steps in a list that block close. */
export function countStepsBlockingClose(steps) {
  return (steps || []).filter(stepBlocksClose).length
}
