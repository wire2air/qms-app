/**
 * Sections for a Workflow Instance detail view. Pure. This is a read-only
 * approval/timeline view — no header actions or banners — so sections is the
 * only builder needed (breadcrumbs are resource-aware and resolved by the page).
 */

/** Anchor-nav sections. The resource summary + approval timeline form a single
 *  body section (no nav pill); the health card lives in the rail.
 */
export function buildWorkflowInstanceSections(_instance) {
  return [{ id: 'details', label: 'Details' }]
}
