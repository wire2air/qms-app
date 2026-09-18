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
    closeDisabledReason,
    canViewAuditTrail,
  } = gates

  const notTerminal = !['DRAFT', 'CLOSED', 'CANCELLED'].includes(statusId)

  return [
    {
      id: 'open',
      label: 'Open Change Request',
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
      // CAPA parity (2026-08-28): the button stays VISIBLE on any OPEN CR the
      // verb allows, and DISABLES with the reason while workflow steps still
      // block (deferred effectiveness checks excepted) — instead of vanishing.
      visible: !!canCloseCr && statusId === 'OPEN',
      disabled: !canClose || !!closing,
      loading: !!closing,
      title: closeDisabledReason || undefined,
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
      // The trail is its own matrix module (`audit_trail:read`), not something
      // change_control:read implies — `audit_log_select_rls` enforces that. The
      // dialog refuses politely now; the button should not be offered to be
      // refused.
      visible: !!canViewAuditTrail,
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
