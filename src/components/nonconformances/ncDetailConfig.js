import { IconPrinter, IconTrash, IconHistory, IconArrowsExchange } from '@tabler/icons-vue'

/** Contextual banners for an NC (SP-6). Pure — caller resolves nc + gate flags. */
export function buildNcBanners(nc, { isEditable, sourceLot, companyPath } = {}) {
  if (!nc) return []
  const banners = []
  if (sourceLot) {
    const path = `/qc-inspection/lots/${sourceLot.id}`
    banners.push({
      id: 'qc-origin', tone: 'info',
      title: 'Created from QC inspection',
      message: sourceLot.lotNumber ? `Lot ${sourceLot.lotNumber}` : undefined,
      actions: [{ id: 'view-lot', label: 'View inspection results', to: companyPath ? companyPath(path) : path }],
    })
  }
  if (nc.isSupplierFacing) {
    banners.push({ id: 'supplier-facing', tone: 'info', title: 'Supplier-facing', message: 'This NC is shared with the supplier.' })
  }
  if (!isEditable && ['CLOSED', 'VOID'].includes(nc.statusId)) {
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

/** Header action descriptors (SP-6). gates = resolved booleans/strings; handlers = callbacks. */
export function buildNcActions(gates = {}, handlers = {}) {
  const { isOwner, statusId, canMarkComplete, markCompleteBlockedReason, canConvert, saving } = gates
  const notTerminal = !['DRAFT', 'CLOSED', 'VOID'].includes(statusId)
  return [
    { id: 'open', label: 'Open NC', variant: 'primary', priority: 100,
      visible: !!isOwner && statusId === 'DRAFT', disabled: !!saving, onSelect: handlers.openOpen },
    { id: 'approve', label: 'Approve & Close', variant: 'primary', priority: 100,
      visible: !!isOwner && notTerminal, disabled: !canMarkComplete, title: markCompleteBlockedReason || undefined, onSelect: handlers.openMarkComplete },
    { id: 'print', label: 'Print', icon: IconPrinter, variant: 'secondary', priority: 50, visible: true, onSelect: handlers.print },
    { id: 'convert', label: 'Convert to supplier-facing', icon: IconArrowsExchange, variant: 'secondary', priority: 20, visible: !!canConvert, onSelect: handlers.openConvert },
    { id: 'audit', label: 'Audit Log', icon: IconHistory, variant: 'secondary', priority: 15, visible: true, onSelect: handlers.openAudit },
    { id: 'delete', label: 'Delete', icon: IconTrash, variant: 'danger', priority: 10, visible: !!isOwner && statusId === 'DRAFT', onSelect: handlers.openDelete },
  ]
}
