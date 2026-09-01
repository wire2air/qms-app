// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { get } from '@/api'

/**
 * Who may be picked for each step of a workflow version, answered by the server.
 *
 * The submit dialog used to work this out itself: read the step's roles from
 * IndexedDB, expand them to users, and treat "no roles found" as "this step is
 * unrestricted". A cache that had not yet synced the role rows was therefore
 * indistinguishable from a step with genuinely no roles, so the dialog offered
 * every internal user and the server refused the pick afterwards — by which
 * point the submitter had already chosen a person and pressed submit.
 *
 * Eligibility now has one implementation, on the server, and it is the same
 * function that validates the picks. `unrestricted` is stated rather than
 * inferred from an empty list, so a cold cache can no longer read as
 * permission.
 *
 * Requests are cached and de-duplicated per workflow version: a dialog renders
 * one of these per step and they would otherwise each fetch the same answer.
 */
const cache = new Map()

function cacheKey(workflowVersionId, moduleId) {
  return `${workflowVersionId}::${moduleId ?? ''}`
}

export function fetchStepReviewerPool(workflowVersionId, moduleId = null) {
  if (!workflowVersionId) return Promise.resolve(null)
  const key = cacheKey(workflowVersionId, moduleId)
  if (cache.has(key)) return cache.get(key)

  const req = get(`/v1/services/workflowVersions/${workflowVersionId}/reviewerPool`, {
    params: moduleId ? { moduleId } : {},
  })
    .then((data) => {
      const byStep = new Map()
      for (const row of data?.pool ?? []) byStep.set(row.stepId, row)
      return byStep
    })
    .catch((err) => {
      // Drop the rejection so a transient failure doesn't poison the cache for
      // the rest of the session; the caller falls back to refusing to guess.
      cache.delete(key)
      throw err
    })

  cache.set(key, req)
  return req
}

/** Testing / long-lived sessions: forget what we know about a version. */
export function invalidateStepReviewerPool(workflowVersionId, moduleId = null) {
  cache.delete(cacheKey(workflowVersionId, moduleId))
}
