/**
 * Turning the server's eligibility answer into what the reviewer picker shows.
 *
 * Two different questions get confused here, so they are named apart:
 *
 *   DECLARED roles  — what the workflow step's template says (`WorkflowStepRole`).
 *   ELIGIBILITY     — who may actually be picked, answered by the server.
 *
 * They are not the same, and the gap between them is a real configuration
 * state: a step naming a role that NOBODY holds. The backend resolves that to
 * an empty pool, and an empty pool means "no constraint" — `submitResourceForReview`
 * enforces the pool only `if (candidatePool.length > 0)`, and the reviewerPool
 * endpoint reports `unrestricted: userIds.length === 0` to match. So such a step
 * accepts anyone.
 *
 * The picker must agree with that, or it offers an empty dropdown for a step
 * the server would happily accept any pick on.
 */

/**
 * Which role ids the user dropdown should filter by — `null` meaning "do not
 * filter, show every internal user".
 *
 * @param {{unrestricted?: boolean}|null} serverPool  the step's row from the reviewerPool endpoint
 * @param {string[]} stepRoleIds                      the step's DECLARED role ids
 * @param {boolean} usingServerPool                   false when falling back to local derivation
 */
export function resolvePickerRoleIds(serverPool, stepRoleIds, usingServerPool) {
  // The server said anyone may be picked. Filtering by the declared role anyway
  // would contradict the same function that validates the submission.
  if (usingServerPool && serverPool?.unrestricted) return null
  return stepRoleIds?.length ? stepRoleIds : null
}

/**
 * True when the step names a role but the pool came back unrestricted — the
 * role exists with no members.
 *
 * Worth surfacing rather than silently showing everyone: the routing the
 * template intended is not in effect, and the fix (assign the role) is not
 * something the submitter would otherwise think to look for.
 */
export function isRoleUnstaffed(serverPool, stepRoleIds, usingServerPool) {
  return !!(usingServerPool && serverPool?.unrestricted && stepRoleIds?.length)
}
