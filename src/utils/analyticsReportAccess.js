/**
 * Who may edit or delete a saved report — the CLIENT-SIDE MIRROR of
 * analytics_reports_update_rls / analytics_reports_delete_rls.
 *
 * ── WHY THESE MOSTLY DELEGATE INSTEAD OF RESTATING THE RULE ─────────────────
 * The policies were read off the live database before this file was written,
 * and DELETE is character-for-character the shape the dashboard policies use.
 * So `canDeleteDashboard` already expresses it, is_system guard included.
 * Writing a second copy under a reports-flavoured name would give us two
 * functions that are identical today and free to drift tomorrow — and the drift
 * would be invisible, because a client-side affordance check that is WRONG does
 * not throw. It just draws a button that 403s, or hides one that would have
 * worked.
 *
 * ── WHERE REPORTS AND DASHBOARDS GENUINELY DIVERGE (2026-08-28) ─────────────
 * UPDATE no longer matches, so canEditReport is no longer a pure delegation:
 *
 *   reports    UPDATE: company AND entitled AND (owner OR is_owner OR manage) AND NOT is_system
 *   dashboards UPDATE: company AND entitled AND (owner OR is_owner OR manage)
 *
 * The guard was added by 20260828120000-system-reports-not-editable, closing
 * QA-5. The pencil used to show on shipped reports while the bin did not, and
 * the pencil WORKED — the edit saved, and the next release silently overwrote
 * name, description and definition from the shipped values. A refusal says no;
 * that said yes and discarded the work later. See the migration for the whole
 * account.
 *
 * Dashboards deliberately keep the looser rule: their editable state is
 * visibility, which the owner can see and reverse themselves, so DashboardSharingDialog
 * warns instead of blocking. (A system dashboard's WIDGETS are rebuilt on
 * release just as a report's definition is, and nothing guards those — same
 * defect, different table, still open.)
 *
 * ── AND THEY ARE NOT THE ENFORCEMENT ────────────────────────────────────────
 * RLS is. These decide which buttons to DRAW. Hiding a button protects nothing;
 * the database refuses the write regardless of what the client offers.
 */
import { canDeleteDashboard, canEditDashboard, isOwnDashboard } from './analyticsDashboardAccess.js'

/**
 * Edit rights, plus the is_system guard that analytics_reports_update_rls gained
 * on 2026-08-28 — so this draws the pencil exactly where the server would accept
 * the write, and nowhere else. See the header for why shipped reports are
 * excluded rather than merely warned about.
 *
 * @param {{ ownerId?: string, isSystem?: boolean }|null} report
 * @param {{ userId?: string|null, canManage?: boolean }} viewer
 */
export function canEditReport(report, viewer) {
  if (!canEditDashboard(report, viewer)) return false
  return !report.isSystem
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
