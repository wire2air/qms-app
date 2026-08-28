import {
  IconClipboardCheck,
  IconClipboardList,
  IconBolt,
  IconBulb,
  IconFileTypePdf,
  IconPlayerPlay,
  IconSend,
  IconBan,
  IconPrinter,
  IconTrash,
} from '@tabler/icons-vue'

/**
 * Contextual banners, panel tabs, and header actions for the Audit Instance
 * detail page. Pure — caller resolves the audit + gate flags/handlers.
 *
 * Panel-mode tabs (not anchor sections). `lazy: false` keeps every panel mounted
 * and toggles visibility with v-show — preserving the in-progress execution state
 * of the Requirements walkthrough / Findings / OFI panels across tab switches
 * (matching the original v-show layout).
 */

/** Contextual banners. Terminal states are read-only; REVIEW is owned by the
 *  close-out workflow engine (also read-only here).
 */
export function buildAuditInstanceBanners(auditInstance) {
  if (!auditInstance) return []
  const banners = []
  const s = auditInstance.statusId
  if (s === 'CANCELLED' || s === 'CLOSED') {
    banners.push({
      id: 'read-only',
      tone: 'neutral',
      title: s === 'CLOSED' ? 'Closed' : 'Cancelled',
      message: `This audit is ${s.toLowerCase()} and read-only.`,
    })
  } else if (auditInstance.executionPhase === 'REVIEW') {
    banners.push({
      id: 'in-review',
      tone: 'info',
      title: 'In close-out review',
      message: 'This audit is in the close-out approval workflow and is read-only until it resolves.',
    })
  }
  return banners
}

/** Panel-mode tab descriptors. Supplier audits stay locked to Information until
 *  the auditor releases the audit (gates.supplierTabsLocked).
 */
export function buildAuditInstanceTabs(gates = {}) {
  const {
    clauseCount = 0,
    findingsTotal = 0,
    ofiCount = 0,
    reportCount = 0,
    supplierTabsLocked = false,
  } = gates
  const all = [
    { value: 'info', label: 'Information', icon: IconClipboardCheck, mode: 'panel', lazy: false },
    {
      value: 'requirements',
      label: 'Requirements',
      icon: IconClipboardList,
      count: clauseCount,
      mode: 'panel',
      lazy: false,
    },
    {
      value: 'findings',
      label: 'Findings',
      icon: IconBolt,
      count: findingsTotal,
      mode: 'panel',
      lazy: false,
    },
    { value: 'ofi', label: 'OFI', icon: IconBulb, count: ofiCount, mode: 'panel', lazy: false },
    {
      value: 'reports',
      label: 'Reports',
      icon: IconFileTypePdf,
      count: reportCount,
      mode: 'panel',
      lazy: false,
    },
  ]
  return supplierTabsLocked ? all.filter((t) => t.value === 'info') : all
}

/** Header action descriptors. gates = resolved booleans/strings/counts; handlers = callbacks.
 *  Status-driven primaries (Release / Start / Submit) are mostly mutually exclusive;
 *  Report/Cancel/Audit Log are secondary; Delete is the danger overflow action.
 */
export function buildAuditInstanceActions(gates = {}, handlers = {}) {
  const {
    canStart,
    canSubmitForCloseOut,
    canCancel,
    canDelete,
    canRelease,
    isReleased,
    statusId,
    transitioning,
    releasing,
    unassessedCount = 0,
    findingsOpen = 0,
  } = gates

  const submitBlocked = unassessedCount > 0 || findingsOpen > 0
  const submitTitle = submitBlocked
    ? unassessedCount > 0
      ? `Assess all requirements first — ${unassessedCount} not yet assessed.`
      : `Resolve or close all findings first — ${findingsOpen} still open.`
    : 'Submit this audit for close-out'
  const submitLabel = submitBlocked
    ? `Submit for Close-Out (${unassessedCount > 0 ? `${unassessedCount} unassessed` : `${findingsOpen} open`})`
    : 'Submit for Close-Out'

  return [
    {
      id: 'release',
      label: 'Release to Supplier',
      icon: IconSend,
      variant: 'primary',
      priority: 100,
      visible: !!canRelease && !isReleased,
      loading: !!releasing,
      onSelect: handlers.release,
    },
    {
      id: 'start',
      label: 'Start Audit',
      icon: IconPlayerPlay,
      variant: 'primary',
      priority: 100,
      visible: !!canStart,
      disabled: !!transitioning,
      onSelect: handlers.start,
    },
    {
      id: 'submit',
      label: submitLabel,
      icon: IconSend,
      variant: 'primary',
      priority: 95,
      visible: !!canSubmitForCloseOut,
      disabled: submitBlocked,
      title: submitTitle,
      onSelect: handlers.openSubmit,
    },
    {
      id: 'report',
      label: 'Report',
      icon: IconPrinter,
      variant: 'secondary',
      priority: 60,
      visible: true,
      onSelect: handlers.report,
    },
    {
      id: 'cancel',
      label: 'Cancel',
      icon: IconBan,
      variant: 'secondary',
      priority: 50,
      visible: !!canCancel,
      disabled: !!transitioning,
      onSelect: handlers.openCancel,
    },
    {
      id: 'auditLog',
      label: 'Audit Log',
      icon: IconClipboardCheck,
      variant: 'secondary',
      priority: 40,
      visible: true,
      onSelect: handlers.openAuditLog,
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: IconTrash,
      variant: 'danger',
      priority: 10,
      visible: !!canDelete && statusId !== 'CLOSED',
      disabled: !!transitioning,
      onSelect: handlers.openDelete,
    },
  ]
}
