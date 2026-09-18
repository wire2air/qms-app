/**
 * Contextual banners, sections, and header actions for a Supplier detail page.
 * Pure — caller resolves supplier + gate flags.
 */

/** Contextual banners for a Supplier. No terminal status concept — suppliers
 *  are ACTIVE / INACTIVE. Read-only banner when the supplier is INACTIVE and
 *  the current user cannot update.
 */
export function buildSupplierBanners(supplier, { canUpdate } = {}) {
  if (!supplier) return []
  const banners = []
  if (!canUpdate && supplier.statusId === 'INACTIVE') {
    banners.push({
      id: 'read-only',
      tone: 'neutral',
      title: 'Read-only',
      message: 'This supplier is inactive and read-only.',
    })
  }
  return banners
}

/**
 * Anchor-nav sections for the Supplier body.
 * The supplier page uses tabs handled inside #section-details, so there is
 * exactly one content section.
 */
export function buildSupplierSections(_supplier) {
  return [{ id: 'details', label: 'Details' }]
}

/**
 * Header action descriptors for the Supplier detail page.
 * The page has no workflow actions — the only persistent header control is
 * the save-state indicator, which BaseDetailLayout handles via isSaving.
 * An empty array satisfies the DetailActionBar contract.
 */
export function buildSupplierActions(_gates = {}, _handlers = {}) {
  return []
}
