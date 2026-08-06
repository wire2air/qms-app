// Enterprise role presets + scope presentation.
//
// Model: a module's ACCESS SCOPE is the read reach (None / Own / Department /
// Site / All). Capabilities (create, update, delete, approve, …) are BINARY and
// act within that reach. A preset is a starting {scope, caps} an admin applies
// then customizes; scope and caps are clamped to what each module supports.

export const SCOPE_LABELS = {
  own: 'Own',
  department: 'Department',
  site: 'Site',
  tenant: 'Company-wide',
}

export const SCOPE_HINTS = {
  own: 'Only records the user owns',
  department: "Records in the user's department",
  site: 'Records at every site assigned to the user',
  tenant: 'All records, company-wide',
}

export const NO_ACCESS_LABEL = 'No access'

// Level vocabulary for the simple-mode matrix rows (permissionMatrixModel's
// LEVEL_IDS + the derived 'custom'). Manage-only modules reuse 'Full control'
// — one vocabulary; the hint carries the nuance.
export const LEVEL_LABELS = {
  none: NO_ACCESS_LABEL,
  viewer: 'Viewer',
  editor: 'Editor',
  approver: 'Approver',
  full: 'Full control',
  custom: 'Custom',
}

export const LEVEL_HINTS = {
  viewer: 'Read only',
  editor: 'Create, edit & export',
  approver: 'Edit plus approve / reject',
  full: 'Every capability the module offers',
  custom: 'Hand-tuned via Customize',
}

// A preset is a whole-role starting point: one level at one scope, swept
// across every module (each module clamps/degrades per what it supports —
// stateForLevel handles manage-only and scope-limited modules).
export const PERMISSION_PRESETS = [
  { id: 'viewer', name: 'Viewer', description: 'Read-only', level: 'viewer', scope: 'department' },
  {
    id: 'contributor',
    name: 'Contributor',
    description: 'Create & edit',
    level: 'editor',
    scope: 'department',
  },
  {
    id: 'approver',
    name: 'Approver',
    description: 'Edit, review & sign off',
    level: 'approver',
    scope: 'site',
  },
  {
    id: 'supervisor',
    name: 'Supervisor',
    description: 'Full control at their site',
    level: 'full',
    scope: 'site',
  },
  {
    id: 'administrator',
    name: 'Administrator',
    description: 'Full control, company-wide',
    level: 'full',
    scope: 'tenant',
  },
]
