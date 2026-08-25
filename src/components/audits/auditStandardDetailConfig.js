import {
  IconCopy,
  IconSend,
  IconPlus,
  IconHistory,
  IconTrash,
  IconArchive,
  IconArchiveOff,
} from '@tabler/icons-vue'

/**
 * Contextual banners for an Audit Standard (SP-6). Pure — caller resolves
 * standard + gate flags.
 *
 * Terminal statuses: the standard row itself has ACTIVE / INACTIVE / ARCHIVED.
 * No supplier-facing concept at the standard level (that lives on audit
 * instances). Read-only banner when the standard has been soft-deleted
 * (statusId==='ARCHIVED') and is not editable.
 */
export function buildAuditStandardBanners(standard, { isEditable } = {}) {
  if (!standard) return []
  const banners = []
  if (!isEditable && standard.statusId === 'ARCHIVED') {
    banners.push({
      id: 'read-only',
      tone: 'neutral',
      title: 'Read-only',
      message: 'This audit standard is archived and read-only.',
    })
  }
  return banners
}

/**
 * Anchor-nav sections for the Audit Standard body (SP-6).
 * - details: standard metadata + description
 * - workflow: approval workflow card (only when a version is UNDER_REVIEW)
 * - requirements: requirements editor / viewer
 */
export function buildAuditStandardSections(standard, { underReviewVersion } = {}) {
  return [
    { id: 'details', label: 'Details' },
    {
      id: 'workflow',
      label: 'Approval Workflow',
      visible: !!underReviewVersion,
    },
    { id: 'requirements', label: 'Requirements' },
  ]
}

/**
 * Header action descriptors (SP-6). gates = resolved booleans/strings;
 * handlers = callbacks.
 *
 * Actions:
 *  - duplicate: clone standard (canCreate)
 *  - submit:    submit editable version for approval (canSubmitEditable + editableVersion)
 *  - newDraft:  spawn a new draft off effective (canSpawnNewDraft)
 *  - audit:     open audit log (always)
 *  - archive:   retire a standard that has an EFFECTIVE version (canDelete).
 *               Archived standards stay on record and existing audits stay
 *               valid; they just leave the pickers for new audits.
 *  - restore:   un-archive (canDelete + isArchived)
 *  - delete:    "Discard draft" — ONLY for a standard that never went
 *               effective (canDelete + !hasEffectiveVersion). A standard with
 *               an effective version is a controlled reference: archivable,
 *               never deletable (user rule 2026-08-24).
 */
export function buildAuditStandardActions(gates = {}, handlers = {}) {
  const {
    canCreate,
    canDelete,
    canSubmitEditable,
    canSpawnNewDraft,
    hasStandard,
    hasEditableVersion,
    hasEffectiveVersion,
    isArchived,
    spawningDraft,
    deleting,
  } = gates
  return [
    {
      id: 'duplicate',
      label: 'Duplicate',
      icon: IconCopy,
      variant: 'secondary',
      priority: 60,
      visible: !!canCreate && !!hasStandard,
      onSelect: handlers.openClone,
    },
    {
      id: 'submit',
      label: 'Submit for Approval',
      icon: IconSend,
      variant: 'primary',
      priority: 100,
      visible: !!canSubmitEditable && !!hasEditableVersion,
      onSelect: handlers.openSubmit,
    },
    {
      id: 'newDraft',
      label: spawningDraft ? 'Creating…' : 'New Draft',
      icon: IconPlus,
      variant: 'secondary',
      priority: 50,
      visible: !!canSpawnNewDraft,
      disabled: !!spawningDraft,
      loading: !!spawningDraft,
      onSelect: handlers.spawnNewDraft,
    },
    {
      id: 'audit',
      label: 'Audit Log',
      icon: IconHistory,
      variant: 'secondary',
      priority: 15,
      visible: !!hasStandard,
      onSelect: handlers.openAudit,
    },
    {
      id: 'archive',
      label: 'Archive',
      icon: IconArchive,
      variant: 'secondary',
      priority: 11,
      visible: !!canDelete && !!hasStandard && !!hasEffectiveVersion && !isArchived,
      disabled: !!deleting,
      onSelect: handlers.openArchive,
    },
    {
      id: 'restore',
      label: 'Restore',
      icon: IconArchiveOff,
      variant: 'secondary',
      priority: 11,
      visible: !!canDelete && !!hasStandard && !!isArchived,
      disabled: !!deleting,
      onSelect: handlers.restoreStandard,
    },
    {
      id: 'delete',
      label: 'Discard draft',
      icon: IconTrash,
      variant: 'danger',
      priority: 10,
      visible: !!canDelete && !!hasStandard && !hasEffectiveVersion,
      disabled: !!deleting,
      loading: !!deleting,
      onSelect: handlers.openDelete,
    },
  ]
}
