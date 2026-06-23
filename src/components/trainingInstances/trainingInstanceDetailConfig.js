import { IconBan } from '@tabler/icons-vue'

/**
 * Contextual banners, sections, and header actions for a Training Instance
 * detail page. Pure — caller resolves the instance + gate flags/handlers.
 */

/** Contextual banners for a Training Instance. The only terminal/read-only
 *  state is CANCELLED, which surfaces the recorded cancellation reason that
 *  previously sat as an inline paragraph under the header.
 */
export function buildTrainingInstanceBanners(instance) {
  if (!instance) return []
  const banners = []
  if (instance.status === 'CANCELLED') {
    banners.push({
      id: 'cancelled',
      tone: 'neutral',
      title: 'Cancelled',
      message: instance.cancelReason
        ? `This training instance was cancelled. Reason: ${instance.cancelReason}`
        : 'This training instance was cancelled.',
    })
  }
  return banners
}

/** Anchor-nav sections. The page is a single body section (summary stats +
 *  assignee progress), so there is exactly one section and no nav pill.
 */
export function buildTrainingInstanceSections(_instance) {
  return [{ id: 'details', label: 'Details' }]
}

/** Header action descriptors. gates = resolved booleans/strings; handlers = callbacks.
 *  Verify is the primary workflow action when the instance awaits manager
 *  verification; Cancel is the secondary action while the instance is active.
 */
export function buildTrainingInstanceActions(gates = {}, handlers = {}) {
  const { canManage, status, needsVerification, cancelling } = gates
  return [
    {
      id: 'verify',
      label: 'Verify Training',
      variant: 'primary',
      priority: 100,
      visible: !!canManage && !!needsVerification,
      onSelect: handlers.verify,
    },
    {
      id: 'cancel',
      label: 'Cancel Instance',
      icon: IconBan,
      variant: 'secondary',
      priority: 60,
      visible: !!canManage && ['ACTIVE', 'PENDING_VERIFICATION'].includes(status),
      disabled: !!cancelling,
      loading: !!cancelling,
      onSelect: handlers.openCancel,
    },
  ]
}
