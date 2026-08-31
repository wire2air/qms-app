import {
  IconArrowUpRight,
  IconBan,
  IconHistory,
  IconCircleCheck,
  IconPrinter,
  IconSend,
} from '@tabler/icons-vue'

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

/** Anchor-nav sections. The page organizes everything into its own three tabs
 *  (Overview / Review / Escalations) inside a single body section, so there is
 *  exactly one section and no nav pill.
 *
 *  Said "6 tabs" until 2026-08-31 — never true of this page, and the kind of
 *  drift that makes a reader trust the next comment less.
 */
export function buildQualityEventSections(_event) {
  return [{ id: 'details', label: 'Details' }]
}

/** Header action descriptors. gates = resolved booleans/strings; handlers = callbacks.
 *
 *  One gate per action, each mirroring its own backend check — a single
 *  `canOwnerActions` for both hid Close AND Escalate from anyone who wasn't the
 *  assigned reviewer, no matter what the role granted.
 *    submit   → quality_events:update (what POST /submit enforces)
 *    close    → assigned reviewer, OR an explicit quality_events:close grant
 *    cancel   → same grant as close (quality_events:update + :close)
 *    escalate → quality_events:update (what POST /escalate enforces)
 *
 *  Submit / Close / Cancel are the ONLY writers of statusId (2026-08-31). The
 *  detail header used to carry a status dropdown bound straight to the field;
 *  it is now a read-only badge, the model excludes statusId from the update
 *  mutation, and the DB trigger refuses a syncEngine-path change with QMSQE.
 *  Which means these three descriptors are the entire lifecycle UI — the legal
 *  edges are DRAFT→OPEN, DRAFT→CANCELLED, OPEN→CLOSED and OPEN→CANCELLED.
 */
export function buildQualityEventActions(gates = {}, handlers = {}) {
  const {
    canClose,
    closeBlockedReason,
    cancelBlockedReason,
    canEscalate,
    canUpdate,
    statusId,
    closing,
    cancelling,
    submitting,
    escalatedTo,
  } = gates
  const isOpen = !['CLOSED', 'CANCELLED'].includes(statusId)
  // Close is narrower than "not terminal". OPEN→CLOSED is the ONLY close edge
  // the lifecycle guard admits, so offering Close on a DRAFT event would hand
  // the user a button the server answers with a 409 ("submit it before closing,
  // or cancel it instead"). Cancel and Escalate stay on `isOpen` because both
  // are legal from DRAFT.
  const isClosable = statusId === 'OPEN'
  // Escalating no longer changes the event's status (2026-08-18) — the event is
  // still open and still has to be reviewed and closed. So "already escalated"
  // is read from the escalation itself, not from the status.
  const alreadyEscalated = !!escalatedTo
  return [
    {
      id: 'submit',
      label: 'Submit',
      icon: IconSend,
      variant: 'primary',
      priority: 120,
      // DRAFT-only — POST /submit is the sole DRAFT→OPEN edge, and it 409s from
      // anywhere else. Note that createQualityEvent writes OPEN, so a DRAFT
      // event is not something the product mints today; this covers rows that
      // already sit in DRAFT and keeps the edge usable if intake ever grows a
      // save-as-draft step.
      //
      // Hidden rather than disabled outside DRAFT: unlike Close, "you can't
      // submit an event that's already open" is not a permissions story with a
      // fix, so a permanently greyed button on every OPEN event would be noise.
      // No e-signature either — submitting an intake record attests to nothing,
      // which is exactly what separates it from Close and Cancel.
      visible: !!canUpdate && statusId === 'DRAFT',
      disabled: !!submitting,
      loading: !!submitting,
      onSelect: handlers.submit,
    },
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
      visible: !!canClose && isClosable,
      disabled: !!closing || !!closeBlockedReason,
      loading: !!closing,
      title: closeBlockedReason || undefined,
      onSelect: handlers.close,
    },
    {
      id: 'cancel',
      label: 'Cancel',
      icon: IconBan,
      variant: 'danger',
      priority: 105,
      // Same claim as Close (`canClose` — assigned reviewer or a
      // quality_events:close grant), because POST /cancel is gated on the same
      // quality_events:update + quality_events:close pair.
      visible: !!canClose && isOpen,
      // …but a DIFFERENT server rule, which is why this gets its own blocked
      // reason instead of reusing `closeBlockedReason`. Close accepts only the
      // assigned reviewer, full stop. Cancel accepts the assigned reviewer when
      // there is one, and ANY close-holder when there isn't — an unassigned
      // event would otherwise be uncancellable, which is exactly the event most
      // likely to need cancelling. Reusing closeBlockedReason here would have
      // disabled that case with "assign a reviewer before closing", sending the
      // user to assign a reviewer purely to be allowed to throw the event away.
      disabled: !!cancelling || !!cancelBlockedReason,
      loading: !!cancelling,
      title: cancelBlockedReason || undefined,
      onSelect: handlers.cancel,
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
