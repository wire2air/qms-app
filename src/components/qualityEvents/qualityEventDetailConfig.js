import { IconArrowUpRight, IconHistory, IconCircleCheck } from '@tabler/icons-vue'

/**
 * Contextual banners, sections, and header actions for a Quality Event detail
 * page. Pure — caller resolves the event + gate flags/handlers.
 */

/** Contextual banners. A CLOSED or CANCELLED event surfaces an informational
 *  status banner at the top of the page.
 */
export function buildQualityEventBanners(event) {
  if (!event) return []
  const banners = []
  if (['CLOSED', 'CANCELLED'].includes(event.statusId)) {
    banners.push({
      id: 'status',
      tone: 'neutral',
      title: event.statusId === 'CLOSED' ? 'Closed' : 'Cancelled',
      message: `This event is ${event.statusId.toLowerCase()}.`,
    })
  }
  return banners
}

/** Anchor-nav sections. The page organizes everything into its own 6 tabs
 *  inside a single body section, so there is exactly one section and no nav pill.
 */
export function buildQualityEventSections(_event) {
  return [{ id: 'details', label: 'Details' }]
}

/** Header action descriptors. gates = resolved booleans/strings; handlers = callbacks.
 *  Owner-only actions (Close / Escalate) are available to the assigned reviewer.
 */
export function buildQualityEventActions(gates = {}, handlers = {}) {
  const { canOwnerActions, statusId, closing } = gates
  return [
    {
      id: 'close',
      label: 'Close',
      icon: IconCircleCheck,
      variant: 'primary',
      priority: 110,
      visible: !!canOwnerActions && !['CLOSED', 'CANCELLED'].includes(statusId),
      disabled: !!closing,
      loading: !!closing,
      onSelect: handlers.close,
    },
    {
      id: 'escalate',
      label: 'Escalate',
      icon: IconArrowUpRight,
      variant: 'primary',
      priority: 100,
      visible: !!canOwnerActions && !['CLOSED', 'CANCELLED'].includes(statusId),
      onSelect: handlers.escalate,
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
  ]
}
