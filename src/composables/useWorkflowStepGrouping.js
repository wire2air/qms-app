/**
 * Workflow step grouping — collapse a run of consecutive steps assigned to the
 * same person into one card they complete once.
 *
 * Users pushed back on having to open and mark complete three steps in a row
 * that were all theirs. This computes the runs; WorkflowStepGroup renders them
 * and posts to `/taskInstances/:id/completeGroup`.
 *
 * ── The off switch ───────────────────────────────────────────────────────────
 * `STEP_GROUPING_ENABLED = false` disables the feature completely: no run is
 * ever formed, so WorkflowStepList falls through to the per-step rendering that
 * exists today and the group endpoint is never called. One boolean, one place.
 *
 * ── Grouping is a suggestion, not an authority ───────────────────────────────
 * The server recomputes eligibility from the database and refuses the call if
 * it disagrees (workflowStepGroupService). This is presentation: getting it
 * wrong here shows the wrong card, it cannot complete a step that shouldn't be.
 * Keep the rules in the two places in step regardless — a UI that groups what
 * the server rejects is a dead button.
 */

/**
 * Master switch. Flip to false to ship without the feature; everything falls
 * back to the existing one-card-per-step behaviour.
 */
export const STEP_GROUPING_ENABLED = true

/** Smallest run worth collapsing. Two steps is the complaint we heard. */
const MIN_GROUP_SIZE = 2

/**
 * Can this step be pulled into a run headed by `userId`?
 *
 * Mirrors stepGroupIneligibleReason() in workflowStepGroupService.js. ACTION
 * only: an APPROVAL is its own attestation and must be given deliberately, and
 * a DELAY parks until its due date so it cannot complete inline.
 *
 * @param {object} step         instance step (needs stepType, statusId)
 * @param {string} userId
 * @param {string[]} assignees  user ids assigned to the step
 * @param {number} openChildren blocking sub-tasks
 */
export function isGroupableStep(step, userId, assignees, openChildren = 0) {
  if (!step) return false
  if (step.stepType !== 'ACTION') return false
  if (openChildren > 0) return false
  if (!Array.isArray(assignees) || assignees.length !== 1) return false
  return assignees[0] === userId
}

/**
 * Build the runs for one ordered list of root steps.
 *
 * A run starts at the step that is IN_PROGRESS (the one the user can act on)
 * and extends forward over PENDING steps while they stay groupable. Only that
 * head can start a run: grouping a set of steps none of which is active yet
 * would offer a Complete button that cannot fire.
 *
 * @param {object[]} steps  root instance steps, ordered by stepNumber
 * @param {object}   ctx
 * @param {string}   ctx.userId
 * @param {(stepId: string) => string[]} ctx.assigneesFor
 * @param {(stepId: string) => number}   ctx.openChildrenFor
 * @param {boolean}  [ctx.enabled]
 * @returns {Map<string, object[]>} head step id → the run (head included)
 */
export function buildStepGroups(steps, { userId, assigneesFor, openChildrenFor, enabled } = {}) {
  const groups = new Map()
  const on = enabled ?? STEP_GROUPING_ENABLED
  if (!on || !userId || !Array.isArray(steps) || steps.length < MIN_GROUP_SIZE) return groups

  const ordered = steps.slice().sort((a, b) => (a.stepNumber ?? 0) - (b.stepNumber ?? 0))

  for (let i = 0; i < ordered.length; i += 1) {
    const head = ordered[i]
    if (head.statusId !== 'IN_PROGRESS') continue
    if (!isGroupableStep(head, userId, assigneesFor(head.id), openChildrenFor(head.id))) continue

    const run = [head]
    for (let j = i + 1; j < ordered.length; j += 1) {
      const next = ordered[j]
      // Only a not-yet-started step may be pulled forward; anything already in
      // flight, sent back or finished keeps its own lifecycle.
      if (next.statusId !== 'PENDING') break
      if (!isGroupableStep(next, userId, assigneesFor(next.id), openChildrenFor(next.id))) break
      run.push(next)
    }

    if (run.length >= MIN_GROUP_SIZE) {
      groups.set(head.id, run)
      // A step belongs to at most one run.
      i += run.length - 1
    }
  }

  return groups
}

/**
 * Which step ids are non-head members of a run, and so must not be rendered as
 * their own card.
 *
 * @param {Map<string, object[]>} groups
 * @returns {Set<string>}
 */
export function collapsedStepIds(groups) {
  const ids = new Set()
  for (const [headId, run] of groups) {
    for (const step of run) if (step.id !== headId) ids.add(step.id)
  }
  return ids
}
