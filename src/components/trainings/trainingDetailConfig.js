import {
  IconRocket,
  IconBook,
  IconArrowBackUp,
  IconArchive,
  IconCircleCheck,
  IconTrash,
} from '@tabler/icons-vue'

/**
 * Contextual banners, sections, and header actions for a Training (library
 * template) detail page. Pure — caller resolves the training + gate flags/handlers.
 */

/** Contextual help for the current status, shown as a tooltip next to the
 *  status badge in the header (rather than a full-width banner). DRAFT is the
 *  only editable state; ACTIVE is published and locked, ARCHIVED is read-only.
 *  Returns '' when there's nothing to explain (DRAFT).
 */
export function trainingStatusHelp(training) {
  if (!training) return ''
  if (training.status === 'ARCHIVED') {
    return 'This training is archived and read-only.'
  }
  if (training.status === 'ACTIVE') {
    return 'This training is published and locked for editing. Unpublish (only possible while no instances exist) to make changes.'
  }
  return ''
}

/** Anchor-nav sections. The page organizes fields into its own 5 tabs inside a
 *  single body section, so there is exactly one section and no nav pill.
 */
export function buildTrainingSections(_training) {
  return [{ id: 'details', label: 'Details' }]
}

/** Header action descriptors. gates = resolved booleans; handlers = callbacks.
 *  DRAFT → Publish (primary) + Delete; ACTIVE → Launch (primary) + Add to
 *  Matrix + Unpublish (when allowed) + Archive.
 */
export function buildTrainingActions(gates = {}, handlers = {}) {
  const { canManage, status, hasManager, canUnpublish, actionLoading } = gates
  const isDraft = status === 'DRAFT'
  const isActive = status === 'ACTIVE'
  return [
    {
      id: 'publish',
      label: 'Publish',
      icon: IconCircleCheck,
      variant: 'primary',
      priority: 100,
      visible: !!canManage && isDraft,
      disabled: !hasManager,
      title: hasManager ? undefined : 'A Training Manager is required before publishing',
      onSelect: handlers.openPublish,
    },
    {
      id: 'launch',
      label: 'Ad-Hoc Training',
      icon: IconRocket,
      variant: 'primary',
      priority: 100,
      visible: !!canManage && isActive,
      onSelect: handlers.launch,
    },
    {
      id: 'addToCurriculum',
      label: 'Add to Curriculum',
      icon: IconBook,
      variant: 'secondary',
      priority: 70,
      visible: !!canManage && isActive,
      onSelect: handlers.addToCurriculum,
    },
    {
      id: 'unpublish',
      label: 'Unpublish',
      icon: IconArrowBackUp,
      variant: 'secondary',
      priority: 50,
      visible: !!canManage && isActive && !!canUnpublish,
      loading: !!actionLoading,
      onSelect: handlers.unpublish,
    },
    {
      id: 'archive',
      label: 'Archive',
      icon: IconArchive,
      variant: 'secondary',
      priority: 40,
      visible: !!canManage && isActive,
      loading: !!actionLoading,
      onSelect: handlers.archive,
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: IconTrash,
      variant: 'danger',
      priority: 10,
      visible: !!canManage && isDraft,
      loading: !!actionLoading,
      onSelect: handlers.openDelete,
    },
  ]
}
