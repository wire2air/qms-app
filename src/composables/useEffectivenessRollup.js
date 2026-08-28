// Effectiveness rollup — list-side reads of the trigger-maintained columns on
// workflow_instances (backend migration 20260828200000). One place answers
// "does this record carry an effectiveness check, and where does it stand?"
// without any list digging through workflow_instance_steps.
//
// The SQL twin for reporting is the `record_effectiveness_rollup` view.
import { DateTime } from 'luxon'

/** Menu options — values are FILTER buckets, not raw states (a bucket may
 *  cover several states, e.g. Pending = not fired yet in any form). */
export const EFFECTIVENESS_FILTER_OPTIONS = [
  { value: 'ANY_CHECK', label: 'Has a check' },
  { value: 'PENDING', label: 'Pending (not fired)' },
  { value: 'AWAITING_VERDICT', label: 'Verdict due' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'EFFECTIVE', label: 'Effective' },
  { value: 'NOT_EFFECTIVE', label: 'Not effective' },
  { value: 'SKIPPED', label: 'Skipped' },
  { value: 'NO_CHECK', label: 'No check' },
]

export const EFFECTIVENESS_STATE_LABELS = {
  NONE: '—',
  PENDING: 'Pending',
  AWAITING_SCHEDULING: 'Awaiting scheduling',
  SCHEDULED: 'Scheduled',
  AWAITING_VERDICT: 'Verdict due',
  EFFECTIVE: 'Effective',
  NOT_EFFECTIVE: 'Not effective',
  SKIPPED: 'Skipped',
  CANCELLED: 'Cancelled',
}

const PENDING_STATES = ['PENDING', 'AWAITING_SCHEDULING', 'SCHEDULED']
const DUE_BEARING_STATES = ['SCHEDULED', 'AWAITING_VERDICT']

/**
 * Map resourceId → CURRENT workflow instance (IN_PROGRESS first, else newest)
 * for one resourceType — the same current-instance rule the rail card and the
 * SQL view use. Full-scan on WorkflowInstance is fine: the table is small and
 * the query re-runs only on its own sync events.
 */
export function useEffectivenessIndex(resourceTypeRef) {
  const instances = useLiveQueryWithDeps(
    [resourceTypeRef],
    async (db, [type]) => {
      if (!type) return []
      const all = await db.WorkflowInstance.where().exec()
      return all.filter((wi) => wi.resourceType === type)
    },
    { models: ['WorkflowInstance'], initial: [] },
  )
  return computed(() => {
    const byResource = new Map()
    for (const wi of instances.value) {
      const prev = byResource.get(wi.resourceId)
      if (!prev || currentnessRank(wi) > currentnessRank(prev)) byResource.set(wi.resourceId, wi)
    }
    return byResource
  })
}

function currentnessRank(wi) {
  return (wi.statusId === 'IN_PROGRESS' ? 1e15 : 0) + (wi.createdAt?.toMillis?.() ?? 0)
}

export function isEffectivenessOverdue(instance) {
  return (
    DUE_BEARING_STATES.includes(instance?.effectivenessState) &&
    !!instance?.effectivenessDueAt &&
    instance.effectivenessDueAt < DateTime.now()
  )
}

/** Multi-select OR semantics: the record matches when ANY chosen bucket does. */
export function matchesEffectivenessFilter(instance, selected) {
  if (!selected?.length) return true
  const state = instance?.effectivenessState ?? 'NONE'
  return selected.some((value) => {
    if (value === 'ANY_CHECK') return state !== 'NONE'
    if (value === 'NO_CHECK') return state === 'NONE'
    if (value === 'PENDING') return PENDING_STATES.includes(state)
    if (value === 'OVERDUE') return isEffectivenessOverdue(instance)
    return state === value
  })
}
