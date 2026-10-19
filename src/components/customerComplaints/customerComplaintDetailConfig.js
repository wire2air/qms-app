import {
  IconArrowUpRight,
  IconClipboardList,
  IconTransform,
  IconUserShare,
  IconClockPause,
  IconMailOff,
  IconMailCheck,
  IconMessageOff,
} from '@tabler/icons-vue'

/** Contextual banners for a Customer Complaint. Pure — caller resolves complaint + gate flags. */
export function buildComplaintBanners(complaint, { isEditable, snoozedUntilLabel } = {}) {
  if (!complaint) return []
  const banners = []
  // Support Desk (spec §3): spam and snooze are states the agent must see first.
  if (complaint.isSpam) {
    banners.push({
      id: 'spam',
      tone: 'warning',
      title: 'Spam',
      message:
        'This ticket is in the Spam box: no notifications, no auto-assign, no auto-replies. Use "Not spam" to restore it.',
    })
  }
  if (snoozedUntilLabel) {
    banners.push({
      id: 'snoozed',
      tone: 'neutral',
      title: 'Snoozed',
      message: `Hidden from the open views until ${snoozedUntilLabel}, or until the customer replies.`,
    })
  }
  if (!isEditable && ['CLOSED', 'CONVERTED_TO_NC'].includes(complaint.statusId)) {
    banners.push({
      id: 'read-only',
      tone: 'neutral',
      title: 'Read-only',
      message: `This complaint is ${complaint.statusId === 'CONVERTED_TO_NC' ? 'converted to NC' : complaint.statusId.toLowerCase()} and read-only.`,
    })
  }
  return banners
}

/** Anchor-nav sections for the Complaint body. */
export function buildComplaintSections(_complaint) {
  return [{ id: 'details', label: 'Details' }]
}

/** Header action descriptors. gates = resolved booleans/strings; handlers = callbacks. */
export function buildComplaintActions(gates = {}, handlers = {}) {
  const {
    isEditable,
    canUpdate,
    canConvert,
    statusId,
    acting,
    hasAssignee,
    canViewAuditTrail,
    // Support Desk (spec §3)
    canTakeOver,
    heldByOther,
    isSpam,
    isSnoozed,
    isLiveChat,
    // QA complaint number when already escalated (action becomes a marker).
    escalatedTo,
  } = gates
  return [
    {
      id: 'accept',
      label: 'Accept',
      variant: 'primary',
      priority: 100,
      visible: !!isEditable && !hasAssignee,
      disabled: !!acting,
      loading: !!acting,
      onSelect: handlers.accept,
    },
    {
      id: 'assign',
      label: hasAssignee ? 'Reassign' : 'Assign',
      variant: 'outline',
      priority: 90,
      visible: !!isEditable,
      disabled: !!acting,
      onSelect: handlers.openAssign,
    },
    {
      // Live chat (spec §4.3): ending resolves the ticket and sends the
      // closing + rating lines to the widget. Primary while the chat runs —
      // it is the chat's natural terminal action, as Resolve is for email.
      id: 'endChat',
      label: 'End chat',
      icon: IconMessageOff,
      variant: 'primary',
      priority: 95,
      visible: !!isEditable && !!isLiveChat && !isSpam,
      disabled: !!acting,
      onSelect: handlers.endChat,
    },
    {
      // Take over is a DIFFERENT affordance from Assign on purpose (spec §3):
      // it is offered only when a colleague holds the ticket, names the act,
      // notifies them, and the audit row records both parties.
      id: 'takeOver',
      label: 'Take over',
      icon: IconUserShare,
      variant: 'outline',
      priority: 85,
      visible: !!isEditable && !!heldByOther && !!canTakeOver && !isSpam,
      disabled: !!acting,
      onSelect: handlers.takeOver,
    },
    {
      id: 'snooze',
      label: isSnoozed ? 'Unsnooze' : 'Snooze',
      icon: IconClockPause,
      variant: 'secondary',
      priority: 40,
      visible: !!isEditable && !isSpam,
      disabled: !!acting,
      onSelect: isSnoozed ? handlers.unsnooze : handlers.openSnooze,
    },
    {
      id: 'spam',
      label: isSpam ? 'Not spam' : 'Mark as spam',
      icon: isSpam ? IconMailCheck : IconMailOff,
      variant: isSpam ? 'secondary' : 'danger',
      priority: 30,
      visible: !!canUpdate && !['CLOSED', 'CONVERTED_TO_NC'].includes(statusId),
      disabled: !!acting,
      onSelect: isSpam ? handlers.unspam : handlers.openSpam,
    },
    {
      id: 'resolve',
      label: 'Resolve',
      variant: 'outline',
      priority: 80,
      visible: !!isEditable && statusId !== 'RESOLVED',
      disabled: !!acting,
      onSelect: handlers.resolve,
    },
    {
      id: 'hold',
      label: 'Hold',
      variant: 'outline',
      priority: 70,
      visible: !!isEditable && statusId !== 'ON_HOLD',
      disabled: !!acting,
      onSelect: handlers.hold,
    },
    {
      id: 'close',
      label: 'Close',
      variant: 'outline',
      priority: 60,
      visible: !!isEditable,
      disabled: !!acting,
      onSelect: handlers.openClose,
    },
    {
      id: 'reopen',
      label: 'Reopen',
      variant: 'outline',
      priority: 55,
      visible: !!canUpdate && ['CLOSED', 'RESOLVED'].includes(statusId),
      disabled: !!acting,
      onSelect: handlers.reopen,
    },
    {
      // The Support → Quality bridge (2026-10-19): any ticket-updater (agents
      // included) can hand a ticket to QA as a NEW QMS complaint. Convert to
      // NC below stays for people who hold ncr:create themselves.
      id: 'escalate',
      label: escalatedTo ? `Escalated · ${escalatedTo}` : 'Escalate to Quality',
      icon: IconArrowUpRight,
      variant: 'primary',
      priority: 52,
      visible: !!canUpdate && !isSpam && !!statusId && statusId !== 'CONVERTED_TO_NC',
      disabled: !!acting || !!escalatedTo,
      onSelect: handlers.openEscalate,
    },
    {
      id: 'convertToNc',
      label: 'Convert to NC',
      icon: IconTransform,
      variant: 'primary',
      priority: 50,
      visible: !!canConvert && !!statusId && statusId !== 'CONVERTED_TO_NC',
      disabled: !!acting,
      onSelect: handlers.openConvert,
    },
    {
      id: 'audit',
      label: 'Audit Log',
      icon: IconClipboardList,
      variant: 'secondary',
      priority: 15,
      // The trail is its own matrix module (`audit_trail:read`), not something
      // complaint_management:read implies — `audit_log_select_rls` enforces
      // that. The dialog refuses politely now; the button should not be offered
      // to be refused.
      visible: !!canViewAuditTrail,
      onSelect: handlers.openAudit,
    },
  ]
}
