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
 *
 *  CFL L-1: the gate is `canDelete` (`option_sets:delete`), NOT `canUpdate`.
 *  It used to be canUpdate here while OptionSetsTab / OptionSetsHome gated the
 *  identical operation on option_sets:delete — the same button, two different
 *  permissions, depending on which page you reached it from. `delete` wins on a
 *  3-to-1 reading: the authz catalog registers option_sets.delete, the REST
 *  route enforces it, and the seeded Quality Manager role deliberately withholds
 *  it. Backed by the database since migration 20260902301000 — option_sets is a
 *  paranoid model, so a delete is an UPDATE setting deleted_at, which
 *  option_set_update_rls would otherwise have admitted on nothing but
 *  option_sets:update.
 */
export function buildOptionSetActions(gates = {}, handlers = {}) {
  const { canDelete } = gates
  return [
    {
      id: 'delete',
      label: 'Delete',
      icon: IconTrash,
      variant: 'danger',
      priority: 10,
      visible: !!canDelete,
      onSelect: handlers.delete,
    },
  ]
}
