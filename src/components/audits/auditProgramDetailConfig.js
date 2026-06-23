import { IconTrash } from '@tabler/icons-vue'

/**
 * Contextual banners, sections, and header actions for an Audit Program
 * detail page. Pure — caller resolves the program + gate flags/handlers.
 */

/** Contextual banners for an Audit Program. A paused program no longer mints
 *  new audits, so surface that state at the top of the page.
 */
export function buildAuditProgramBanners(program) {
  if (!program) return []
  const banners = []
  if (!program.active) {
    banners.push({
      id: 'paused',
      tone: 'neutral',
      title: 'Paused',
      message:
        'This program is paused — the generator will not mint new audits. Existing audits keep running.',
    })
  }
  return banners
}

/** Anchor-nav sections. Details + schedule + auditor pool stack in a single
 *  body section (no nav pill, per the ≤1-section rule).
 */
export function buildAuditProgramSections(_program) {
  return [{ id: 'details', label: 'Details' }]
}

/** Header action descriptors. gates = resolved booleans; handlers = callbacks.
 *  Navigation back to the programs list is provided by the breadcrumb; the
 *  only header action is Delete (archive).
 */
export function buildAuditProgramActions(gates = {}, handlers = {}) {
  const { canDelete, deleting } = gates
  return [
    {
      id: 'delete',
      label: 'Delete',
      icon: IconTrash,
      variant: 'danger',
      priority: 10,
      visible: !!canDelete,
      disabled: !!deleting,
      onSelect: handlers.openDelete,
    },
  ]
}
