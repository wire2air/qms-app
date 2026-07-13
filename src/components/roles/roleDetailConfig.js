/**
 * Sections and header actions for a Role detail page. Pure — caller resolves
 * the role + gate flags/handlers. Status is shown as a header badge (no banner).
 * NOTE: this page uses an explicit Save flow (not autosave) and axios-backed
 * composables — that data layer is pre-existing and preserved as-is; only the
 * layout is migrated.
 */

/** Anchor-nav sections. The permissions matrix is the single body section (no
 *  nav pill); description + assigned-users live in the rail.
 */
export function buildRoleSections(_role) {
  return [{ id: 'permissions', label: 'Permissions' }]
}

/**
 * Header action descriptors. gates = resolved booleans; handlers = callbacks.
 * `canUpdate` is the EDIT gate (false when the role is locked); `canLock` is the
 * raw permission (so lock/unlock stay available on a locked role).
 */
export function buildRoleActions(gates = {}, handlers = {}) {
  const { canUpdate, canLock, locked, hasRole, isInactive, saving } = gates
  return [
    {
      id: 'save',
      label: 'Save Changes',
      variant: 'primary',
      priority: 100,
      visible: !!canUpdate,
      disabled: !!saving,
      loading: !!saving,
      onSelect: handlers.save,
    },
    {
      id: 'cancel',
      label: 'Cancel',
      variant: 'secondary',
      priority: 60,
      visible: !!canUpdate,
      onSelect: handlers.cancel,
    },
    {
      id: 'unlock',
      label: 'Unlock',
      variant: 'secondary',
      priority: 45,
      visible: !!hasRole && !!canLock && !!locked,
      onSelect: handlers.unlock,
    },
    {
      id: 'lock',
      label: 'Lock',
      variant: 'secondary',
      priority: 45,
      visible: !!hasRole && !!canLock && !locked,
      onSelect: handlers.lock,
    },
    {
      id: 'activate',
      label: 'Activate',
      variant: 'secondary',
      priority: 40,
      visible: !!hasRole && !!canUpdate && !!isInactive,
      onSelect: handlers.activate,
    },
    {
      id: 'deactivate',
      label: 'Deactivate',
      variant: 'secondary',
      priority: 40,
      visible: !!hasRole && !!canUpdate && !isInactive,
      onSelect: handlers.deactivate,
    },
  ]
}
