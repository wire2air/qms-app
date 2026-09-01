import { IconHistory } from '@tabler/icons-vue'

/**
 * Sections and header actions for a User detail page. Pure — caller resolves
 * the user + gate flags/handlers. No status banners (user status is shown as a
 * header badge).
 */

/** Anchor-nav sections. Personal Information is the single body section (no nav
 *  pill); avatar/metadata + role assignments live in the rail.
 */
export function buildUserSections(_user) {
  return [{ id: 'details', label: 'Details' }]
}

/** Header action descriptors. gates = resolved booleans; handlers = callbacks.
 *  Send Invitation (primary) shows for un-invited users; Audit Log overflows.
 */
export function buildUserActions(gates = {}, handlers = {}) {
  const { canUpdate, hasUser, inviteSent, sendingInvite, canViewAuditTrail } = gates
  return [
    {
      id: 'sendInvite',
      label: 'Send Invitation',
      variant: 'primary',
      priority: 100,
      visible: !!canUpdate && !!hasUser && !inviteSent,
      loading: !!sendingInvite,
      onSelect: handlers.sendInvite,
    },
    {
      id: 'auditLog',
      label: 'Audit Log',
      icon: IconHistory,
      variant: 'secondary',
      priority: 20,
      // "What has this user done" is the platform trail, governed by
      // `audit_trail:read` — user_management:read does not imply it (see
      // `audit_log_select_rls`). The dialog refuses politely now; the button
      // should not be offered to be refused.
      visible: !!hasUser && !!canViewAuditTrail,
      onSelect: handlers.openAuditLog,
    },
  ]
}
