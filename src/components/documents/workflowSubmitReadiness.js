/**
 * Can this document actually be submitted for review?
 *
 * The reviewer picker used to treat a step with NO candidates as satisfied:
 *
 *   if (s.candidates.length === 0) return true  // "the backend's fallback handles them"
 *
 * There is no such fallback. `activateInstanceStep` counts live assignees and
 * throws "Step X has no reviewers assigned, so it cannot be started" — so a
 * candidate-less step doesn't fail at submit, it fails when the step in FRONT
 * of it is approved. The submitter sees success; the approver, possibly days
 * later, hits an error on a document that can no longer advance, and nothing
 * in the UI offers to assign someone at that point.
 *
 * This is the documented invariant behind e2e j15 — "no workflow_instance_step
 * may be IN_PROGRESS with zero live assignees and zero open tasks" — whose
 * accepted remedies are "publication is refused OR the step refuses to
 * activate". The backend already does the second. This does the first, where
 * the person who can still fix it is looking at the screen.
 *
 * Reported 2026-08-15: a template's Approval step carried Quality Manager, a
 * role no active user held, and the document submitted anyway.
 */

/**
 * @param {Array<{id: string, name?: string, candidates: Array, roleNames: Array}>} steps
 * @param {Record<string, string[]>} selections  stepId → picked user ids
 * @returns {{ ok: boolean, unstaffed: string[], unpicked: string[], reason: string|null }}
 */
export function submitReadiness(steps, selections = {}) {
  const unstaffed = []
  const unpicked = []

  for (const step of steps ?? []) {
    const label = step.name || 'Unnamed step'
    if ((step.candidates?.length ?? 0) === 0) {
      // Nobody is eligible at all — picking is impossible, not merely skipped.
      unstaffed.push(label)
      continue
    }
    const picked = selections[step.id]
    if (!Array.isArray(picked) || picked.length === 0) unpicked.push(label)
  }

  // Unstaffed first: it needs an admin to change a role assignment, which is a
  // different and slower job than picking from a list you already have.
  let reason = null
  if (unstaffed.length) {
    reason =
      `No eligible reviewer for ${unstaffed.join(', ')}. ` +
      'Assign a user to the step’s role, or change the workflow, before submitting.'
  } else if (unpicked.length) {
    reason = `Pick at least one reviewer for ${unpicked.join(', ')}.`
  }

  return { ok: unstaffed.length === 0 && unpicked.length === 0, unstaffed, unpicked, reason }
}
