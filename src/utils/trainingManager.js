/**
 * Training-manager defaulting from the employee supervisor relationship.
 *
 * When a set of assignees all report to the SAME supervisor, that supervisor is
 * defaulted as the training manager (verifier). If they differ — or anyone has
 * no supervisor — there's no default and a manager must be chosen manually.
 */
export function commonSupervisorId(users) {
  const list = (users || []).filter(Boolean)
  if (!list.length) return null
  const first = list[0].supervisorId
  if (!first) return null
  return list.every((u) => u.supervisorId === first) ? first : null
}
