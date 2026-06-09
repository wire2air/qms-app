import { computed, unref } from 'vue'
import { useLiveQueryWithDeps } from '@/composables/useLiveQuery'

/**
 * Conformance scoring rollup for an audit instance (#1).
 *
 * Live-queries the audit's requirement responses and derives the result
 * breakdown + conformance % + pass/fail. Shared by the audit-instance
 * right-rail widget and the printable audit report so both agree.
 *
 * Scoring model (count-based):
 *   - NA rows are excluded from the denominator entirely.
 *   - CONFORMING + OFI count as conformant (OFI = conforming with an
 *     improvement note); MINOR_NC + MAJOR_NC are nonconformities.
 *   - conformancePct = (conforming + ofi) / (everything except NA).
 *   - pass = no MAJOR_NC (a major nonconformity fails the audit).
 *
 * @param {import('vue').Ref<string>|string} auditInstanceId
 */
export function useAuditScoring(auditInstanceId) {
  // Accept a getter (() => id), a ref, or a plain string. unref alone does NOT
  // invoke a getter — without this the id became the function itself and the
  // query fell back to scanning EVERY audit's responses (wrong totals).
  const readId = () =>
    typeof auditInstanceId === 'function' ? auditInstanceId() : unref(auditInstanceId)

  const responses = useLiveQueryWithDeps(
    [() => readId()],
    async (db, [id]) => {
      if (!id) return []
      return db.AuditRequirementResponse.where('auditInstanceId', id).exec()
    },
    { initial: [] },
  )

  const scoring = computed(() => {
    const counts = { CONFORMING: 0, MINOR_NC: 0, MAJOR_NC: 0, OFI: 0, NA: 0 }
    for (const r of responses.value) {
      if (counts[r.resultId] !== undefined) counts[r.resultId] += 1
    }
    // Only count responses carrying a verdict — in-progress rows (#27, null
    // result_id) aren't assessed yet.
    const assessed = responses.value.filter((r) => r.resultId).length
    const scored = counts.CONFORMING + counts.OFI + counts.MINOR_NC + counts.MAJOR_NC
    const conformant = counts.CONFORMING + counts.OFI
    const conformancePct = scored > 0 ? Math.round((conformant / scored) * 100) : null
    const pass = counts.MAJOR_NC === 0
    return { counts, assessed, scored, conformant, conformancePct, pass }
  })

  return { responses, scoring }
}
