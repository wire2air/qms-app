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
 *  Supersede-model header actions (2026-08-08): the BOOK carries the
 *  approval lifecycle. Draft/Rejected → Submit + Discard; Active →
 *  Create replacement + Mark Obsolete (requires a reason, keeps the book
 *  as controlled history — never deletes).
 */
export function buildLogBookActions(gates = {}, handlers = {}) {
  const { canUpdate, hasLogBook, statusId } = gates
  const editable = statusId === 'DRAFT' || statusId === 'REJECTED'
  return [
    {
      id: 'submit',
      label: 'Submit for Approval',
      variant: 'primary',
      priority: 5,
      visible: !!canUpdate && !!hasLogBook && editable,
      onSelect: handlers.submitForApproval,
    },
    {
      id: 'replace',
      label: 'Create Replacement',
      variant: 'outline',
      priority: 8,
      visible: !!canUpdate && !!hasLogBook && statusId === 'ACTIVE',
      onSelect: handlers.createReplacement,
    },
    {
      id: 'discard',
      label: 'Discard Draft',
      variant: 'danger',
      priority: 15,
      visible: !!canUpdate && !!hasLogBook && editable,
      onSelect: handlers.discardDraft,
    },
    {
      id: 'obsolete',
      label: 'Mark Obsolete',
      variant: 'danger',
      priority: 10,
      visible: !!canUpdate && !!hasLogBook && statusId === 'ACTIVE',
      onSelect: handlers.markObsolete,
    },
  ]
}
