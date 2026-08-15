/**
 * Pure shape of a document's approval route — the data behind
 * DocumentApprovalFlowStrip.
 *
 * Split out of the component so it can be tested: anything that imports a
 * SyncEngine model fails to mount under vitest (the decorator babel plugin
 * isn't in vitest.config.js), and the interesting logic here is the mapping
 * from nine workflow-instance step statuses onto four stepper states.
 */

/** Step reached its end successfully — SKIPPED counts, the route moved past it. */
export const DONE_STATUSES = new Set(['APPROVED', 'SKIPPED'])
/** Step is where the work currently sits, including the awkward ones. */
export const ACTIVE_STATUSES = new Set([
  'IN_PROGRESS',
  'CHANGES_REQUESTED',
  'SENT_BACK',
  'SCHEDULED',
])
/** Route stopped here. */
export const FAILED_STATUSES = new Set(['REJECTED', 'CANCELLED'])

/** Map one instance-step status onto a BaseStepper state. */
export function stepperStatus(statusId) {
  if (DONE_STATUSES.has(statusId)) return 'complete'
  if (FAILED_STATUSES.has(statusId)) return 'error'
  if (ACTIVE_STATUSES.has(statusId)) return 'current'
  return 'upcoming'
}

/**
 * Collapse instance steps to the route actually worth showing: newest row per
 * template step (a send-back re-instances a step, leaving older rows behind),
 * root steps only, in order.
 */
export function routeSteps(instanceSteps) {
  const latest = new Map()
  for (const s of instanceSteps ?? []) {
    const key = s.stepId ?? `adhoc:${s.id}`
    const seen = latest.get(key)
    if (!seen || s.createdAt > seen.createdAt) latest.set(key, s)
  }
  return [...latest.values()]
    .filter((s) => !s.parentInstanceStepId)
    .sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0))
}
