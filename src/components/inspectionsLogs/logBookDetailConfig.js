/**
 * Sections and header actions for a Log Book detail page. Pure — caller resolves
 * the log book + gate flags/handlers. The page keeps its own BaseTabs (with
 * badges + the "no effective version" indicator) inside a single body section,
 * so there is no config `tabs` — just one section.
 */

/** Anchor-nav sections. The page's own tab strip (Details/Schema/Versions/
 *  Assignments) lives inside this single body section (no nav pill).
 */
export function buildLogBookSections(_logBook) {
  return [{ id: 'details', label: 'Details' }]
}

/** Header action descriptors. gates = resolved booleans; handlers = callbacks.
 *  Version-management actions (create/submit/discard) live inside the tab
 *  content; the only header action is Archive (back nav is the breadcrumb).
 */
export function buildLogBookActions(gates = {}, handlers = {}) {
  const { canUpdate, hasLogBook } = gates
  return [
    {
      id: 'archive',
      label: 'Archive',
      variant: 'danger',
      priority: 10,
      visible: !!canUpdate && !!hasLogBook,
      onSelect: handlers.archive,
    },
  ]
}
