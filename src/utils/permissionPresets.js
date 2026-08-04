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
  tenant: 'All',
}

export const SCOPE_HINTS = {
  own: 'Only records the user owns',
  department: "Records in the user's department",
  site: 'Records at every site assigned to the user',
  tenant: 'All records, company-wide',
}

export const NO_ACCESS_LABEL = 'No access'

export const PERMISSION_PRESETS = [
  { id: 'viewer', name: 'Viewer', description: 'Read-only', scope: 'department', caps: [] },
  {
    id: 'contributor',
    name: 'Contributor',
    description: 'Create & edit',
    scope: 'department',
    caps: ['create', 'update', 'export'],
  },
  {
    id: 'approver',
    name: 'Approver',
    description: 'Review & sign off',
    scope: 'site',
    caps: ['approve', 'reject', 'export'],
  },
  {
    id: 'supervisor',
    name: 'Supervisor',
    description: 'Full workflow',
    scope: 'site',
    caps: ['create', 'update', 'approve', 'reject', 'close', 'reopen', 'assign', 'export'],
  },
  {
    id: 'administrator',
    name: 'Administrator',
    description: 'Full control, company-wide',
    scope: 'tenant',
    caps: ['create', 'update', 'delete', 'approve', 'reject', 'close', 'reopen', 'assign', 'export'],
  },
]
