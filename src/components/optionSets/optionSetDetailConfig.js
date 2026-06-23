import { IconTrash } from '@tabler/icons-vue'

/**
 * Sections and header actions for an Option Set detail page. Pure — caller
 * resolves the option set + gate flags/handlers. Option sets have no status or
 * banner states, so there is no banners builder.
 */

/** Anchor-nav sections. The options manager is a single body section (no nav
 *  pill, per the ≤1-section rule).
 */
export function buildOptionSetSections(_optionSet) {
  return [{ id: 'details', label: 'Details' }]
}

/** Header action descriptors. The only action is Delete (immediate — the page
 *  has no confirmation dialog).
 */
export function buildOptionSetActions(gates = {}, handlers = {}) {
  const { canUpdate } = gates
  return [
    {
      id: 'delete',
      label: 'Delete',
      icon: IconTrash,
      variant: 'danger',
      priority: 10,
      visible: !!canUpdate,
      onSelect: handlers.delete,
    },
  ]
}
