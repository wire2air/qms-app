import { IconPencil } from '@tabler/icons-vue'

/**
 * Panel tabs and header actions for a Product (Item Master) detail page. Pure —
 * caller resolves the product + gate flags/handlers. Editing is via a dialog
 * (not inline), so the only action is Edit. No status banners (status is a badge).
 */

/** Panel-mode tabs: Overview (core fields) + Specifications (QC specs scoped to
 *  this item).
 */
export function buildProductTabs(_product) {
  return [
    { value: 'overview', label: 'Overview', mode: 'panel' },
    { value: 'specifications', label: 'Specifications', mode: 'panel' },
  ]
}

/** Header action descriptors. gates = resolved booleans; handlers = callbacks. */
export function buildProductActions(gates = {}, handlers = {}) {
  const { canUpdate } = gates
  return [
    {
      id: 'edit',
      label: 'Edit',
      icon: IconPencil,
      variant: 'secondary',
      priority: 100,
      visible: !!canUpdate,
      onSelect: handlers.edit,
    },
  ]
}
