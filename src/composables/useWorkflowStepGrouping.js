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
 * @param {string} ownerId      the run's owner — the person the run belongs to,
 *                              not necessarily the viewer
 * @param {string[]} assignees  user ids assigned to the step
 * @param {number} openChildren blocking sub-tasks
 */
export function isGroupableStep(step, ownerId, assignees, openChildren = 0) {
  if (!step) return false
  if (step.stepType !== 'ACTION') return false
  if (openChildren > 0) return false
  if (!Array.isArray(assignees) || assignees.length !== 1) return false
  return assignees[0] === ownerId
}

/** A step past this point is finished; it keeps its own card and its history. */
const TERMINAL_STATUSES = ['APPROVED', 'REJECTED', 'SKIPPED', 'CANCELLED']

/**
 * Build the runs for one ordered list of root steps.
 *
 * Grouping is a DISPLAY fact, not an entitlement: any consecutive stretch of
 * ACTION steps held by one person groups, whoever that person is and whether or
 * not it is actionable yet. Two steps both belonging to Steve read as "Steve
 * does these together" long before Steve can start them, and that is what the
 * reader wants to see (reported 2026-08-18: reassigning step 1 away split the
 * remaining two apart, when they were still one person's work).
 *
 * Whether the viewer gets a Complete button is decided separately, by
 * WorkflowStepRun, from whether they hold an actionable task on the head.
 *
 * @param {object[]} steps  root instance steps, ordered by stepNumber
 * @param {object}   ctx
 * @param {string}   ctx.userId
 * @param {(stepId: string) => string[]} ctx.assigneesFor
 * @param {(stepId: string) => number}   ctx.openChildrenFor
 * @param {boolean}  [ctx.enabled]
 * @returns {Map<string, object[]>} head step id → the run (head included)
 */
export function buildStepGroups(steps, { assigneesFor, openChildrenFor, enabled } = {}) {
  const groups = new Map()
  const on = enabled ?? STEP_GROUPING_ENABLED
  if (!on || !Array.isArray(steps) || steps.length < MIN_GROUP_SIZE) return groups

  const ordered = steps.slice().sort((a, b) => (a.stepNumber ?? 0) - (b.stepNumber ?? 0))

  let i = 0
  while (i < ordered.length) {
    const head = ordered[i]
    const owner = (assigneesFor(head.id) ?? [])[0]
    // A run needs one identifiable owner and a step that is still to be done.
    if (
      !owner ||
      TERMINAL_STATUSES.includes(head.statusId) ||
      !isGroupableStep(head, owner, assigneesFor(head.id), openChildrenFor(head.id))
    ) {
      i += 1
      continue
    }

    const run = [head]
    for (let j = i + 1; j < ordered.length; j += 1) {
      const next = ordered[j]
      if (TERMINAL_STATUSES.includes(next.statusId)) break
      if (!isGroupableStep(next, owner, assigneesFor(next.id), openChildrenFor(next.id))) break
      run.push(next)
    }

    if (run.length >= MIN_GROUP_SIZE) {
      groups.set(head.id, run)
      i += run.length
    } else {
      i += 1
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
