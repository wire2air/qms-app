import { IconPrinter, IconTrash, IconHistory, IconArrowsExchange } from '@tabler/icons-vue'

/** Contextual banners for an NC (SP-6). Pure — caller resolves nc + gate flags. */
export function buildNcBanners(nc, { isEditable } = {}) {
  if (!nc) return []
  const banners = []
  // (No qc-origin banner: the NC created from a lot carries the full
  // inspection-report PDF as a description attachment instead — the evidence
  // stands alone, no cross-module link needed.)
  if (nc.isSupplierFacing) {
    banners.push({ id: 'supplier-facing', tone: 'info', title: 'Supplier-facing', message: 'This NC is shared with the supplier.' })
  }
  if (!isEditable && ['CLOSED', 'CANCELLED'].includes(nc.statusId)) {
    banners.push({ id: 'read-only', tone: 'neutral', title: 'Read-only', message: `This NC is ${nc.statusId.toLowerCase()} and read-only.` })
  }
  return banners
}

/** Anchor-nav sections for the NC body (SP-6). `capas` only when CAPA is required. */
export function buildNcSections(nc) {
  return [
    { id: 'details', label: 'Details' },
    { id: 'workflow', label: 'Workflow' },
    { id: 'disposition', label: 'Disposition' },
    { id: 'capas', label: 'CAPAs', visible: nc?.capaRequired === true },
  ]
}

/**
 * Header action descriptors (SP-6). gates = resolved booleans/strings; handlers = callbacks.
 *
 * Each action is gated on the VERB its controller enforces, not on ownership.
 * These read `!!isOwner` until 2026-08-19, which had two failure modes now that
 * the backend is matrix-driven (backend utils/recordAccess.js): a role granted
 * ncr:close could not see the button unless it also owned the record, and an
 * owner WITHOUT ncr:close saw a button the API would refuse. The gate names now
 * line up 1:1 with the controller's assertCanActOnRecord action — canOpen and
 * canConvert are 'update', canClose is 'close', canDelete is 'delete'.
 */
export function buildNcActions(gates = {}, handlers = {}) {
  const { canOpen, canClose, canDelete, statusId, canMarkComplete, markCompleteBlockedReason, canConvert, saving, completing } = gates
  const notTerminal = !['DRAFT', 'CLOSED', 'CANCELLED'].includes(statusId)
  return [
    { id: 'open', label: 'Open NC', variant: 'primary', priority: 100,
      visible: !!canOpen && statusId === 'DRAFT', disabled: !!saving, loading: !!saving, onSelect: handlers.openOpen },
    { id: 'approve', label: 'Approve & Close', variant: 'primary', priority: 100,
      visible: !!canClose && notTerminal, disabled: !canMarkComplete || !!completing, loading: !!completing, title: markCompleteBlockedReason || undefined, onSelect: handlers.openMarkComplete },
    { id: 'print', label: 'Print', icon: IconPrinter, variant: 'secondary', priority: 50, visible: true, onSelect: handlers.print },
    { id: 'convert', label: 'Convert to supplier-facing', icon: IconArrowsExchange, variant: 'secondary', priority: 20, visible: !!canConvert, onSelect: handlers.openConvert },
    { id: 'audit', label: 'Audit Log', icon: IconHistory, variant: 'secondary', priority: 15, visible: true, onSelect: handlers.openAudit },
    { id: 'delete', label: 'Delete', icon: IconTrash, variant: 'danger', priority: 10, visible: !!canDelete && statusId === 'DRAFT', onSelect: handlers.openDelete },
  ]
}
