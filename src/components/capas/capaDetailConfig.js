import { IconPrinter, IconTrash, IconHistory, IconArrowsExchange } from '@tabler/icons-vue'

/** Contextual banners for a CAPA (SP-6). Pure — caller resolves capa + gate flags.
 *  No QC-origin banner — CAPA uses RecordLineagePanel for source context instead.
 */
export function buildCapaBanners(capa, { isEditable } = {}) {
  if (!capa) return []
  const banners = []
  if (capa.isSupplierFacing) {
    banners.push({
      id: 'supplier-facing',
      tone: 'info',
      title: 'Supplier-facing',
      message: 'This CAPA is shared with the supplier.',
    })
  }
  if (!isEditable && ['CLOSED', 'CANCELLED'].includes(capa.statusId)) {
    banners.push({
      id: 'read-only',
      tone: 'neutral',
      title: 'Read-only',
      message: `This CAPA is ${capa.statusId.toLowerCase()} and read-only.`,
    })
  }
  return banners
}

/** Anchor-nav sections for the CAPA body (SP-6). Effectiveness always visible;
 *  the CapaEffectivenessCheckCard self-manages its mode (pre-close vs. active).
 */
export function buildCapaSections(_capa) {
  return [
    { id: 'details', label: 'Details' },
    { id: 'workflow', label: 'Workflow' },
    { id: 'effectiveness', label: 'Effectiveness' },
  ]
}

/** Header action descriptors (SP-6). gates = resolved booleans/strings; handlers = callbacks. */
export function buildCapaActions(gates = {}, handlers = {}) {
  const { isOwner, statusId, canClose, closeDisabledReason, canCreateChangeRequest, saving, closing, cancelling } = gates
  return [
    {
      id: 'open',
      label: 'Open CAPA',
      variant: 'primary',
      priority: 100,
      visible: !!isOwner && statusId === 'DRAFT',
      disabled: !!saving,
      loading: !!saving,
      onSelect: handlers.openOpen,
    },
    {
      id: 'close',
      label: 'Close CAPA',
      variant: 'primary',
      priority: 100,
      visible: !!isOwner && statusId === 'PENDING',
      disabled: !canClose || !!closing,
      loading: !!closing,
      title: closeDisabledReason || undefined,
      onSelect: handlers.openClose,
    },
    {
      id: 'cancel',
      label: 'Cancel CAPA',
      variant: 'secondary',
      priority: 60,
      visible: !!isOwner && statusId === 'PENDING',
      disabled: !!cancelling,
      loading: !!cancelling,
      onSelect: handlers.openCancel,
    },
    {
      id: 'print',
      label: 'Print',
      icon: IconPrinter,
      variant: 'secondary',
      priority: 50,
      visible: true,
      onSelect: handlers.print,
    },
    {
      id: 'createCr',
      label: 'Create Change Request',
      icon: IconArrowsExchange,
      variant: 'secondary',
      priority: 20,
      visible: !!canCreateChangeRequest && statusId !== 'DRAFT',
      onSelect: handlers.createCr,
    },
    {
      id: 'audit',
      label: 'Audit Log',
      icon: IconHistory,
      variant: 'secondary',
      priority: 15,
      visible: true,
      onSelect: handlers.openAudit,
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: IconTrash,
      variant: 'danger',
      priority: 10,
      visible: !!isOwner && statusId === 'DRAFT',
      onSelect: handlers.openDelete,
    },
  ]
}
