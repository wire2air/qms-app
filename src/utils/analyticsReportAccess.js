/**
 * Who may edit or delete a saved report — the CLIENT-SIDE MIRROR of
 * analytics_reports_update_rls / analytics_reports_delete_rls.
 *
 * ── WHY THIS DELEGATES INSTEAD OF RESTATING THE RULE ────────────────────────
 * The two policies were read off the live database before this file was
 * written, and they are character-for-character the same shape the dashboard
 * policies use:
 *
 *   UPDATE: company AND entitled AND (owner_id = me OR is_owner OR manage)
 *   DELETE: company AND        (owner_id = me OR is_owner OR manage) AND NOT is_system
 *
 * So `canEditDashboard` / `canDeleteDashboard` already express exactly this
 * rule, including the is_system guard on delete. Writing a second copy under a
 * reports-flavoured name would give us two functions that are identical today
 * and free to drift tomorrow — and the drift would be invisible, because a
 * client-side affordance check that is WRONG does not throw. It just draws a
 * button that 403s, or hides one that would have worked.
 *
 * These wrappers exist purely so calling code at a report site reads as being
 * about reports. They add no rule of their own.
 *
 * ── AND THEY ARE NOT THE ENFORCEMENT ────────────────────────────────────────
 * RLS is. These decide which buttons to DRAW. Hiding a button protects nothing;
 * the database refuses the write regardless of what the client offers.
 */
import { canDeleteDashboard, canEditDashboard, isOwnDashboard } from './analyticsDashboardAccess.js'

/**
 * @param {{ ownerId?: string }|null} report
 * @param {{ userId?: string|null, canManage?: boolean }} viewer
 */
export function canEditReport(report, viewer) {
  return canEditDashboard(report, viewer)
}

/**
 * Edit rights plus the is_system guard. A shipped report set would otherwise be
 * permanently lost from the tenant and silently recreated by the next upgrade,
 * which reads as the delete having failed rather than having been refused.
 *
 * @param {{ ownerId?: string, isSystem?: boolean }|null} report
 * @param {{ userId?: string|null, canManage?: boolean }} viewer
 */
export function canDeleteReport(report, viewer) {
  return canDeleteDashboard(report, viewer)
}

/**
 * Ownership, which is a DIFFERENT question from canEdit: a manage-holder can
 * edit a report that is emphatically not theirs, and the list groups by
 * ownership rather than by editability.
 *
 * @param {{ ownerId?: string }|null} report
 * @param {string|null} userId
 */
export function isOwnReport(report, userId) {
  return isOwnDashboard(report, userId)
}

/** The empty definition a new report starts from. */
export function blankDefinition() {
  return { periodToken: 'last_12_months', sections: [blankSection()] }
}

/** One empty section. */
export function blankSection() {
  return { title: '', metricKeys: [], breakdown: null }
}

/**
 * Normalise a definition on the way to the database.
 *
 * The exporter reads `definition.sections[].metricKeys` and
 * `definition.sections[].breakdown` directly and has no tolerance for junk: an
 * empty-string metric key becomes a metric it cannot resolve, which it renders
 * as a row reading "not available" rather than failing — so a typo becomes a
 * permanent blank line in an exported PDF that nobody can explain.
 *
 * A breakdown needs BOTH a metricKey and a dimension; half of one is dropped
 * rather than stored, because the exporter's guard is
 * `if (section.breakdown?.metricKey && section.breakdown?.dimension)` and a
 * half-filled breakdown would silently render nothing at all.
 */
export function normaliseDefinition(definition) {
  const sections = (definition?.sections ?? [])
    .map((s) => {
      const metricKeys = (s.metricKeys ?? []).map((k) => String(k ?? '').trim()).filter(Boolean)
      const breakdown =
        s.breakdown?.metricKey && s.breakdown?.dimension
          ? { metricKey: s.breakdown.metricKey, dimension: s.breakdown.dimension }
          : null
      return { title: String(s.title ?? '').trim(), metricKeys, breakdown }
    })
    // A section with no metrics and no breakdown renders as a bare heading over
    // nothing. Dropping it here is kinder than exporting it.
    .filter((s) => s.metricKeys.length > 0 || s.breakdown)

  return {
    periodToken: definition?.periodToken || 'last_12_months',
    sections,
  }
}

/** Is this definition worth saving at all? */
export function definitionHasContent(definition) {
  return normaliseDefinition(definition).sections.length > 0
}
