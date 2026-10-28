/**
 * Shared predicate for record-close gating: does a workflow instance step still
 * BLOCK the record from being closed? Mirrors the backend
 * services/workflowCloseGate.js (applied by countOpenStepsForClose).
 *
 * A step blocks unless it is
 *   - terminal (APPROVED / SKIPPED / CANCELLED);
 *   - a DEFERRED delay step — an effectiveness-check-style DELAY step that is
 *     allowed to outlive the close and fire afterward. Deferred = a DELAY step
 *     that has already fired (IN_PROGRESS) or is armed with a wake date
 *     (SCHEDULED + delayUntil set). An awaiting-scheduling delay (SCHEDULED, no
 *     date) STILL blocks — the owner must schedule or skip it first, or it
 *     would never fire;
 *   - a closed gate that has been RE-RUN. A send-back marks the gate row
 *     SENT_BACK (a rejection REJECTED) and the rework creates FRESH rows for the
 *     same template step with a higher stepNumber; the old row stays as history
 *     and is never updated again, so it must not hold the record open (user
 *     report 2026-10-27: a module record whose approval was once sent back
 *     offered Cancel but never Close). Until the re-run exists the closed gate
 *     keeps blocking.
 */
const TERMINAL = ['APPROVED', 'SKIPPED', 'CANCELLED']
const CLOSED_GATE = ['SENT_BACK', 'REJECTED']

/** A later row for the same template step in the same instance: the re-run. */
export function isSupersededStep(step, siblings) {
  if (!step?.stepId) return false
  return (siblings || []).some(
    (s) =>
      s &&
      s.id !== step.id &&
      s.stepId === step.stepId &&
      s.workflowInstanceId === step.workflowInstanceId &&
      Number(s.stepNumber) > Number(step.stepNumber),
  )
}

/**
 * @param {object} step
 * @param {object[]} [siblings] every step of the same instance(s), `step` included
 */
export function stepBlocksClose(step, siblings = []) {
  if (!step) return false
  if (TERMINAL.includes(step.statusId)) return false
  if (step.stepType === 'DELAY') {
    if (step.statusId === 'IN_PROGRESS') return false
    if (step.statusId === 'SCHEDULED' && step.delayUntil) return false
  }
  if (CLOSED_GATE.includes(step.statusId) && isSupersededStep(step, siblings)) return false
  return true
}

/** Count the steps in a list that block close. Pass the WHOLE list of the instance(s). */
export function countStepsBlockingClose(steps) {
  const list = (steps || []).filter(Boolean)
  return list.filter((s) => stepBlocksClose(s, list)).length
}
