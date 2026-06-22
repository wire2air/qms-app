import {
  IconPrinter,
  IconTrash,
  IconHistory,
  IconMessage,
  IconFileDescription,
  IconArchive,
  IconClipboardList,
} from '@tabler/icons-vue'

/** Contextual banners for a Document detail page.
 *  Pure — caller resolves document + gate flags.
 */
export function buildDocumentBanners(document, { isArchived } = {}) {
  if (!document) return []
  const banners = []
  if (isArchived) {
    banners.push({
      id: 'archived',
      tone: 'neutral',
      title: 'Archived',
      message: 'This document has been archived and is read-only.',
    })
  }
  return banners
}

/** Anchor-nav sections for the Document body.
 *  Single section — all content is in DocumentsMainContent.
 */
export function buildDocumentSections(_document) {
  return [{ id: 'content', label: 'Content' }]
}

/** Header action descriptors for the Document detail page.
 *  gates = resolved booleans; handlers = callbacks.
 *
 *  Note: the #actions slot in DocumentsPageId.vue renders the full
 *  toolbar verbatim (version selector popover, AI buttons, TaskActionBar).
 *  These descriptors exist so the config has an actions array — the slot
 *  overrides the default DetailActionBar render.
 */
export function buildDocumentActions(gates = {}, handlers = {}) {
  const {
    canCreate,
    canSubmitForReview,
    canCancelReview,
    canSetEffective,
    canShowWorkflow,
    canEdit,
    canDeleteVersion,
    canDelete,
  } = gates
  return [
    {
      id: 'create-draft',
      label: 'Create New Draft',
      variant: 'primary',
      priority: 100,
      visible: !!canCreate,
      onSelect: handlers.createDraft,
    },
    {
      id: 'submit-review',
      label: 'Submit For Review',
      variant: 'primary',
      priority: 90,
      visible: !!canSubmitForReview,
      onSelect: handlers.submitForReview,
    },
    {
      id: 'cancel-review',
      label: 'Cancel Review',
      variant: 'danger',
      priority: 80,
      visible: !!canCancelReview,
      onSelect: handlers.cancelReview,
    },
    {
      id: 'set-effective',
      label: 'Set Effective',
      variant: 'primary',
      priority: 70,
      visible: !!canSetEffective,
      onSelect: handlers.setEffective,
    },
    {
      id: 'show-workflow',
      label: 'Show Workflow',
      variant: 'outline',
      priority: 60,
      visible: !!canShowWorkflow,
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
      id: 'revision-history',
      label: 'Revision History',
      icon: IconHistory,
      variant: 'secondary',
      priority: 40,
      visible: true,
      onSelect: handlers.revisionHistory,
    },
    {
      id: 'audit',
      label: 'Audit Log',
      icon: IconClipboardList,
      variant: 'secondary',
      priority: 30,
      visible: true,
      onSelect: handlers.auditLog,
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
      id: 'export',
      label: 'Export',
      icon: IconFileDescription,
      variant: 'secondary',
      priority: 20,
      visible: true,
      onSelect: handlers.export,
    },
    {
      id: 'delete-version',
      label: 'Delete Version',
      icon: IconTrash,
      variant: 'danger',
      priority: 10,
      visible: !!canDeleteVersion,
      onSelect: handlers.deleteVersion,
    },
    {
      id: 'archive',
      label: 'Archive Document',
      icon: IconArchive,
      variant: 'danger',
      priority: 5,
      visible: !!canEdit && !!canDelete,
      onSelect: handlers.archiveDocument,
    },
  ]
}
