import { IconArrowUpRight, IconHistory, IconCircleCheck, IconPrinter } from '@tabler/icons-vue'

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
 *
 *  One gate per action, each mirroring its own backend check — a single
 *  `canOwnerActions` for both hid Close AND Escalate from anyone who wasn't the
 *  assigned reviewer, no matter what the role granted.
 *    close    → assigned reviewer, OR an explicit quality_events:close grant
 *    escalate → quality_events:update (what POST /escalate enforces)
 */
export function buildQualityEventActions(gates = {}, handlers = {}) {
  const { canClose, closeBlockedReason, canEscalate, statusId, closing, escalatedTo } = gates
  const isOpen = !['CLOSED', 'CANCELLED'].includes(statusId)
  // Escalating no longer changes the event's status (2026-08-18) — the event is
  // still open and still has to be reviewed and closed. So "already escalated"
  // is read from the escalation itself, not from the status.
  const alreadyEscalated = !!escalatedTo
  return [
    {
      id: 'close',
      label: 'Close',
      icon: IconCircleCheck,
      variant: 'primary',
      priority: 110,
      // `canClose` is "has a claim to close this" — the assigned reviewer, or a
      // role holding quality_events:close. `closeBlockedReason` is the narrower
      // question the SERVER asks, and it only accepts the assigned reviewer
      // (closeQualityEvent → assertAssignedReviewer).
      //
      // Splitting them stops the button being offered and then refused: before
      // 2026-08-18 a user with the close grant who was not the reviewer got the
      // button, clicked it, and collected a 403. Disabled-with-a-reason instead
      // of hidden, because this person DOES hold the permission — the fix is to
      // get assigned, and the tooltip has to say so.
      visible: !!canClose && isOpen,
      disabled: !!closing || !!closeBlockedReason,
      loading: !!closing,
      title: closeBlockedReason || undefined,
      onSelect: handlers.close,
    },
    {
      id: 'escalate',
      label: 'Escalate',
      icon: IconArrowUpRight,
      variant: 'primary',
      priority: 100,
      visible: !!canEscalate && isOpen,
      // Disabled rather than hidden: a vanished button reads as a permissions
      // problem, whereas a disabled one with the target in its tooltip answers
      // "what happened to this event?" without a trip to the audit log.
      disabled: alreadyEscalated,
      title: alreadyEscalated ? `Already escalated to ${escalatedTo}` : undefined,
      onSelect: handlers.escalate,
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
      visible: true,
      onSelect: handlers.openAudit,
    },
  ]
}
