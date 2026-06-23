import {
  IconFileText,
  IconHistory,
  IconSchool,
  IconNotes,
  IconSend,
  IconChecks,
  IconX,
  IconPrinter,
  IconChartBar,
  IconClipboardList,
  IconFileDescription,
  IconMessage,
  IconTrash,
  IconArchive,
} from '@tabler/icons-vue'

/**
 * Contextual banners, panel tabs, and header actions for the Document control
 * detail page. Pure — caller resolves document/version + gate flags/handlers.
 *
 * Note: this page uses PANEL-MODE TABS (not anchor sections). The document's own
 * Content / Change Control / Training tabs are hoisted to BaseDetailLayout; there
 * is intentionally no `sections` builder (anchor nav over its own tabs is what the
 * reverted wave-1 attempt got wrong).
 */

/** Contextual banners. ARCHIVED is the only terminal/read-only state. */
export function buildDocumentBanners(document) {
  if (!document) return []
  const banners = []
  if (document.statusId === 'ARCHIVED') {
    banners.push({
      id: 'archived',
      tone: 'neutral',
      title: 'Archived',
      message: 'This document is archived and read-only.',
    })
  }
  return banners
}

/** Panel-mode tab descriptors. Change Control is revision-only (hidden on v1.0,
 *  which has no prior version to compare against).
 */
export function buildDocumentTabs(isRevisionVersion) {
  return [
    { value: 'content', label: 'Content', icon: IconFileText, mode: 'panel' },
    ...(isRevisionVersion
      ? [{ value: 'changeControl', label: 'Change Control', icon: IconHistory, mode: 'panel' }]
      : []),
    { value: 'training', label: 'Training', icon: IconSchool, mode: 'panel' },
  ]
}

/** Header action descriptors for DetailActionBar. gates = resolved booleans/strings;
 *  handlers = callbacks. One status-driven primary is visible at a time; Print is the
 *  secondary; everything else overflows (DetailActionBar shows the top 2 by priority).
 *  Bespoke controls (AskAi, Summarize, What-changed, TaskActionBar, Version picker)
 *  are NOT here — they ride in the #actions slot beside DetailActionBar.
 */
export function buildDocumentActions(gates = {}, handlers = {}) {
  const {
    canCreate,
    canSubmitForReview,
    canCancelReview,
    canSetEffective,
    canEdit,
    canDelete,
    statusId,
    selectedStatus,
    inReview,
  } = gates
  return [
    {
      id: 'createDraft',
      label: 'Create New Draft',
      icon: IconNotes,
      variant: 'primary',
      priority: 100,
      visible: !!canCreate,
      onSelect: handlers.createDraft,
    },
    {
      id: 'submitForReview',
      label: 'Submit For Review',
      icon: IconSend,
      variant: 'primary',
      priority: 100,
      visible: !!canSubmitForReview,
      onSelect: handlers.submitForReview,
    },
    {
      id: 'setEffective',
      label: 'Set Effective',
      icon: IconChecks,
      variant: 'primary',
      priority: 100,
      visible: !!canSetEffective,
      onSelect: handlers.setEffective,
    },
    {
      id: 'cancelReview',
      label: 'Cancel Review',
      icon: IconX,
      variant: 'danger',
      priority: 90,
      visible: !!canCancelReview,
      onSelect: handlers.cancelReview,
    },
    {
      id: 'showWorkflow',
      label: 'Show Workflow',
      variant: 'secondary',
      priority: 55,
      visible: !!inReview && !!canEdit,
      onSelect: handlers.showWorkflow,
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
      id: 'reports',
      label: 'Reports',
      icon: IconChartBar,
      variant: 'secondary',
      priority: 45,
      visible: true,
      onSelect: handlers.reports,
    },
    {
      id: 'revisionHistory',
      label: 'Revision History',
      icon: IconHistory,
      variant: 'secondary',
      priority: 40,
      visible: true,
      onSelect: handlers.revisionHistory,
    },
    {
      id: 'auditLog',
      label: 'Audit Log',
      icon: IconClipboardList,
      variant: 'secondary',
      priority: 35,
      visible: true,
      onSelect: handlers.auditLog,
    },
    {
      id: 'export',
      label: 'Export',
      icon: IconFileDescription,
      variant: 'secondary',
      priority: 30,
      visible: true,
      onSelect: handlers.export,
    },
    {
      id: 'discussion',
      label: 'Discussion',
      icon: IconMessage,
      variant: 'secondary',
      priority: 25,
      visible: true,
      onSelect: handlers.discussion,
    },
    {
      id: 'deleteVersion',
      label: 'Delete Version',
      icon: IconTrash,
      variant: 'danger',
      priority: 15,
      visible: !!canDelete && selectedStatus === 'DRAFT',
      onSelect: handlers.deleteVersion,
    },
    {
      id: 'archive',
      label: 'Archive Document',
      icon: IconArchive,
      variant: 'danger',
      priority: 10,
      visible: !!canEdit && statusId !== 'ARCHIVED',
      onSelect: handlers.archive,
    },
  ]
}
