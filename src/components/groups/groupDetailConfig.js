/**
 * Sections for a Group (Team) detail page. Pure. The page has no status banners
 * and no header action buttons (only an autosave indicator), so sections is the
 * only builder needed.
 */

/** Anchor-nav sections. Members is the single body section (no nav pill, per the
 *  ≤1-section rule); team settings + avatar live in the rail.
 */
export function buildGroupSections(_group) {
  return [{ id: 'details', label: 'Details' }]
}
