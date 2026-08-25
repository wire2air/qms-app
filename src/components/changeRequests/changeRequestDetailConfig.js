import { IconPrinter, IconTrash, IconHistory } from '@tabler/icons-vue'

/** Contextual banners for a Change Request (SP-6). Pure — caller resolves cr + gate flags. */
export function buildChangeRequestBanners(cr, { isEditable } = {}) {
  if (!cr) return []
  const banners = []
  if (!isEditable && ['CLOSED', 'CANCELLED', 'REJECTED'].includes(cr.statusId)) {
    banners.push({
      id: 'read-only',
      tone: 'neutral',
      title: 'Read-only',
      message: `This Change Request is ${cr.statusId.toLowerCase()} and read-only.`,
    })
  }
  return banners
}

/** Anchor-nav sections for the Change Request body (SP-6). */
export function buildChangeRequestSections(_cr) {
  return [
    { id: 'details', label: 'Details' },
    { id: 'reason', label: 'Reason & Justification' },
    { id: 'workflow', label: 'Workflow' },
  ]
}

/** Header action descriptors (SP-6). gates = resolved booleans/strings; handlers = callbacks. */
export function buildChangeRequestActions(gates = {}, handlers = {}) {
  const {
    canOpen,
    canCloseCr,
    canCancel,
    canDeleteCr,
    canDelete,
    statusId,
    canClose,
    closing,
    cancelling,
    opening,
    deleting,
  } = gates

  const notTerminal = !['DRAFT', 'CLOSED', 'REJECTED', 'CANCELLED'].includes(statusId)

  return [
    {
      id: 'open',
      label: 'Submit for Approval',
      variant: 'primary',
      priority: 100,
      visible: !!canOpen && statusId === 'DRAFT',
      disabled: !!opening,
      loading: !!opening,
      onSelect: handlers.openOpen,
    },
    {
      id: 'close',
      label: 'Close',
      variant: 'danger',
      priority: 90,
      visible: !!canCloseCr && !!canClose,
      disabled: !canClose || !!closing,
      loading: !!closing,
      onSelect: handlers.openClose,
    },
    {
      id: 'cancel',
      label: 'Cancel',
      variant: 'secondary',
      priority: 70,
      visible: !!canCancel && notTerminal,
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
      visible: !!canDeleteCr && !!canDelete && statusId === 'DRAFT',
      disabled: !!deleting,
      loading: !!deleting,
      onSelect: handlers.openDelete,
    },
  ]
}
