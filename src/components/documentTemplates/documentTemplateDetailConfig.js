import { IconSend, IconArchive, IconArchiveOff, IconPencil } from '@tabler/icons-vue'

/**
 * Banners, sections, and header actions for a Document Template detail page.
 * Pure — caller resolves the template + gate flags/handlers. Only DRAFT
 * templates are editable; PUBLISHED / ARCHIVED are immutable.
 */

/** Read-only banners for the immutable lifecycle states. */
export function buildDocumentTemplateBanners(template) {
  if (!template) return []
  const banners = []
  if (template.statusId === 'PUBLISHED') {
    banners.push({
      id: 'published',
      tone: 'info',
      title: 'Published',
      message: 'This template is published and is read-only — it may be referenced by documents.',
    })
  } else if (template.statusId === 'ARCHIVED') {
    banners.push({
      id: 'archived',
      tone: 'neutral',
      title: 'Archived',
      message: 'This template is archived and read-only. Unarchive it to return to draft and edit.',
    })
  }
  return banners
}

/** Anchor-nav sections. Default Settings + the sections editor form a single
 *  body section (no nav pill, per the ≤1-section rule).
 */
export function buildDocumentTemplateSections(_template) {
  return [{ id: 'details', label: 'Details' }]
}

/** Header action descriptors. gates = resolved booleans/strings; handlers = callbacks.
 *  Each handler runs its own confirm() dialog (useConfirm), so there are no
 *  BaseDialog components to wire here.
 */
export function buildDocumentTemplateActions(gates = {}, handlers = {}) {
  const { canUpdate, canArchive, statusId } = gates
  return [
    {
      id: 'publish',
      label: 'Publish',
      icon: IconSend,
      variant: 'primary',
      priority: 100,
      visible: !!canUpdate && statusId === 'DRAFT',
      onSelect: handlers.publish,
    },
    {
      // Document templates are NOT versioned (see the deferred form-artifact
      // versioning decision) — a PUBLISHED one is immutable, and the only way
      // back to editable used to be Archive → Unarchive. That is a trap:
      // archiving pulls the template out of the document-create picker, so the
      // detour silently takes it out of service. This does the same DRAFT
      // transition directly, with the consequence stated up front.
      id: 'revise',
      label: 'Reopen for Editing',
      icon: IconPencil,
      variant: 'secondary',
      priority: 90,
      visible: !!canUpdate && statusId === 'PUBLISHED',
      onSelect: handlers.revise,
    },
    {
      id: 'archive',
      label: 'Archive',
      icon: IconArchive,
      variant: 'danger',
      priority: 20,
      visible: !!canArchive && statusId !== 'ARCHIVED',
      onSelect: handlers.archive,
    },
    {
      id: 'unarchive',
      label: 'Unarchive',
      icon: IconArchiveOff,
      variant: 'secondary',
      priority: 20,
      visible: !!canArchive && statusId === 'ARCHIVED',
      onSelect: handlers.unarchive,
    },
  ]
}
