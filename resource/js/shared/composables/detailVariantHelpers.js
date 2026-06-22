/** Structural variant descriptors (SP-1 spec §4). Pure. */
const VARIANTS = {
  standard: { showBreadcrumbs: true, stickyHeader: true, showNav: true, showRail: true, columns: 2, editable: true, linearized: false, stub: false },
  readonly: { showBreadcrumbs: true, stickyHeader: true, showNav: true, showRail: true, columns: 2, editable: false, linearized: false, stub: false },
  embedded: { showBreadcrumbs: false, stickyHeader: false, showNav: false, showRail: false, columns: 1, editable: true, linearized: false, stub: false },
  print: { showBreadcrumbs: false, stickyHeader: false, showNav: false, showRail: true, columns: 1, editable: false, linearized: true, stub: false },
}
const STUBS = new Set(['approval', 'workflow-review', 'split'])

export function resolveVariant(variant = 'standard') {
  if (VARIANTS[variant]) return { variant, ...VARIANTS[variant] }
  if (STUBS.has(variant)) return { variant, ...VARIANTS.standard, stub: true }
  return { variant: 'standard', ...VARIANTS.standard }
}

export function morphHeaderVariant(headerVariant, scrolled) {
  return headerVariant === 'full' && scrolled ? 'compact' : headerVariant
}
