/**
 * Presentation metadata for the six insight rules.
 *
 * ── THE LIST IS MIRRORED FROM THE CHECK CONSTRAINT, NOT INVENTED ────────────
 * `analytics_insights` carries:
 *
 *   CHECK (rule_id = ANY (ARRAY['threshold_crossing','ranked_outlier','streak',
 *                               'change_point','seasonal_anomaly','robust_anomaly']))
 *   CHECK (rule_class = ANY (ARRAY['deterministic','statistical']))
 *
 * so this file adds LABELS and nothing else. It must never gain a seventh id
 * (the CHECK would reject the row, and a filter offering it would return
 * permanently empty) nor drop one (a real row would render with no badge).
 *
 * ── seasonal_anomaly AND robust_anomaly ARE DELIBERATELY DISTINCT ───────────
 * They are separate rule ids in the engine on purpose, and the labels here keep
 * them apart for the same reason: a reader who sees "Seasonal anomaly" believes
 * the time of year was accounted for, and the robust one did no such thing —
 * it fell back to a median-and-MAD test because there was not enough history to
 * establish a seasonal pattern. Giving them one shared label would quietly undo
 * that, and the row's `method` column (rendered alongside) would be the only
 * remaining clue.
 */

/** rule_class values, from the CHECK. */
export const RULE_CLASS = {
  DETERMINISTIC: 'deterministic',
  STATISTICAL: 'statistical',
}

/**
 * Every rule_id the CHECK permits, in the order a reader should meet them:
 * the deterministic ones first, because they are the ones that need no
 * statistical trust to act on.
 */
export const INSIGHT_RULES = [
  {
    id: 'threshold_crossing',
    label: 'Threshold',
    ruleClass: RULE_CLASS.DETERMINISTIC,
    badgeClass: 'tw:bg-amber-100 tw:text-amber-800',
  },
  {
    id: 'ranked_outlier',
    label: 'Outlier',
    ruleClass: RULE_CLASS.DETERMINISTIC,
    badgeClass: 'tw:bg-purple-100 tw:text-purple-800',
  },
  {
    id: 'streak',
    label: 'Streak',
    ruleClass: RULE_CLASS.DETERMINISTIC,
    badgeClass: 'tw:bg-blue-100 tw:text-blue-800',
  },
  {
    id: 'change_point',
    label: 'Change point',
    ruleClass: RULE_CLASS.STATISTICAL,
    badgeClass: 'tw:bg-teal-100 tw:text-teal-800',
  },
  {
    id: 'seasonal_anomaly',
    label: 'Seasonal anomaly',
    ruleClass: RULE_CLASS.STATISTICAL,
    badgeClass: 'tw:bg-indigo-100 tw:text-indigo-800',
  },
  {
    id: 'robust_anomaly',
    // NOT "anomaly" — see the header. This one did not account for seasonality.
    label: 'Anomaly (no seasonal basis)',
    ruleClass: RULE_CLASS.STATISTICAL,
    badgeClass: 'tw:bg-slate-100 tw:text-slate-800',
  },
]

const BY_ID = new Map(INSIGHT_RULES.map((r) => [r.id, r]))

/**
 * Presentation for one rule id.
 *
 * An unrecognised id falls back to showing the id ITSELF rather than a friendly
 * default, so a rule added to the CHECK without being added here is visible
 * immediately instead of rendering as a plausible-looking "Insight".
 *
 * @param {string|null} ruleId
 */
export function ruleMeta(ruleId) {
  return (
    BY_ID.get(ruleId) ?? {
      id: ruleId,
      label: ruleId || 'Insight',
      ruleClass: null,
      badgeClass: 'tw:bg-gray-100 tw:text-gray-700',
    }
  )
}
