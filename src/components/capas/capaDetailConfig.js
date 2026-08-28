import {
  IconLink,
  IconPrinter,
  IconTrash,
  IconHistory,
  IconArrowsExchange,
} from '@tabler/icons-vue'

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
    // The Effectiveness section is gone (2026-08-18). Effectiveness checks are
    // a DELAY step in the workflow now, so they render with the rest of the
    // steps rather than in a section of their own. The record-based
    // CapaEffectivenessCheck table, its endpoints and its card are still in
    // the codebase but unreachable — kept only until the transition is done.
  ]
}

/** Header action descriptors (SP-6). gates = resolved booleans/strings; handlers = callbacks. */
export function buildCapaActions(gates = {}, handlers = {}) {
  const {
    canStart,
    canCloseCapa,
    canCancel,
    canDelete,
    statusId,
    canClose,
    closeDisabledReason,
    canCreateChangeRequest,
    canUpdate,
    saving,
    closing,
    cancelling,
  } = gates
  return [
    {
      id: 'open',
      label: 'Start CAPA',
      variant: 'primary',
      priority: 100,
      visible: !!canStart && statusId === 'DRAFT',
      disabled: !!saving,
      loading: !!saving,
      onSelect: handlers.openOpen,
    },
    {
      id: 'close',
      label: 'Close CAPA',
      variant: 'primary',
      priority: 100,
      // 'OPEN', not 'PENDING'. 20260823100000-unified-record-statuses retired
      // PENDING from capa_statuses; this gate kept comparing to it, so Close
      // rendered for nobody on any CAPA — 152 of them in the E2E tenant alone.
      // The list page was migrated in the same window (CapasHome.vue
      // OPEN_STATUSES); only this action bar was missed. See capa/22 §1.
      visible: !!canCloseCapa && statusId === 'OPEN',
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
      // 'OPEN' — same retired status as Close above.
      visible: !!canCancel && statusId === 'OPEN',
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
      // Many NCs to one CAPA: several nonconformances sharing a root cause are
      // corrected by a single CAPA. Previously the link could only be made by
      // raising the CAPA *from* an NC, so a CAPA opened first — or a second NC
      // found later — had no way to say so (2026-08-17).
      id: 'linkNc',
      label: 'Link Nonconformance',
      icon: IconLink,
      variant: 'secondary',
      priority: 18,
      visible: !!canUpdate,
      onSelect: handlers.linkNc,
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
      visible: !!canDelete && statusId === 'DRAFT',
      onSelect: handlers.openDelete,
    },
  ]
}
