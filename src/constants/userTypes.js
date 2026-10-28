/**
 * User types, role tiers and seat licensing — the frontend mirror of
 * qms/backend/shared/constants/userTypes.js (and the CHECKs in migration
 * 20261026130000); change both together.
 *
 * Only QUALITY users do quality work: workflow step assignees, record owners,
 * approvers, supervisors. Operators and trainees are free (no seat) and may
 * only hold roles of their tier; support-only agents are the desk's. Pickers
 * use `isQualityUser`; the Users and Roles screens use the rest.
 */
export const USER_TYPES = Object.freeze([
  { code: 'QUALITY', label: 'Quality user', seat: 'QUALITY', description: 'Owns, edits and approves quality records. Uses a Quality license.' },
  { code: 'OPERATOR', label: 'Operator', seat: null, description: 'Floor user: log book entries, training, SOPs, raising a quality event. Free.' },
  { code: 'TRAINEE', label: 'Trainee', seat: null, description: 'Training-only user: SOPs, training, raising a quality event. Free.' },
  { code: 'SUPPORT', label: 'Support agent', seat: 'SUPPORT', description: 'Support Desk only — no QMS access. Uses a Support license.' },
  { code: 'SUPPLIER', label: 'Supplier user', seat: null, description: 'A person at one of your suppliers (supplier portal).' },
  { code: 'SERVICE', label: 'Service account', seat: null, description: 'API key identity.' },
])

/** The types an admin picks for a person on the Users screen. */
export const ASSIGNABLE_USER_TYPES = Object.freeze(['QUALITY', 'OPERATOR', 'TRAINEE'])

export const ASSIGNABLE_USER_TYPE_OPTIONS = Object.freeze(
  USER_TYPES.filter((t) => ASSIGNABLE_USER_TYPES.includes(t.code)).map((t) => ({
    value: t.code,
    label: t.label,
    description: t.description,
  })),
)

export const ROLE_TIERS = Object.freeze([
  { code: 'QUALITY', label: 'Quality', description: 'Any permission. Held by Quality users only.' },
  { code: 'OPERATOR', label: 'Operator', description: 'Log books, training, SOPs, quality events. Held by Operators and Quality users.' },
  { code: 'TRAINEE', label: 'Trainee', description: 'SOPs, training, quality events. Held by anyone.' },
])

export const ROLE_TIER_OPTIONS = Object.freeze(
  ROLE_TIERS.map((t) => ({ value: t.code, label: t.label, description: t.description })),
)

const RANK = Object.freeze({ TRAINEE: 1, OPERATOR: 2, QUALITY: 3 })

export function roleTierAllowedForUserType(tier, userType) {
  if (tier === 'SUPPORT') return userType === 'SUPPORT' || userType in RANK
  if (userType === 'SERVICE') return true
  if (!(userType in RANK)) return false
  return RANK[userType] >= (RANK[tier] ?? Infinity)
}

export function userTypeLabel(code) {
  return USER_TYPES.find((t) => t.code === code)?.label ?? code ?? null
}

export function roleTierLabel(code) {
  if (code === 'SUPPORT') return 'Support Desk'
  return ROLE_TIERS.find((t) => t.code === code)?.label ?? code ?? null
}

/** Candidates for quality work: step assignees, record owners, approvers. */
export function isQualityUser(user) {
  return (
    !!user &&
    (user.userType ?? 'QUALITY') === 'QUALITY' &&
    user.kind !== 'EXTERNAL_SUPPLIER' &&
    !user.isServiceAccount
  )
}

export const OPERATOR_PERMISSION_ALLOWLIST = Object.freeze([
  'document_control:read',
  'training:read',
  'training_instances:read',
  'log_books:read',
  'log_books:create',
  'log_books:update',
  'field_records:read_own',
  'field_records:create',
  'field_records:edit_own_in_window',
  'inspections:read',
  'quality_events:create',
  'quality_events:read',
  'tasks:read',
  'notifications:read',
  'products:read',
  'records:read',
])

export const TRAINEE_PERMISSION_ALLOWLIST = Object.freeze([
  'document_control:read',
  'training:read',
  'training_instances:read',
  'quality_events:create',
  'quality_events:read',
  'tasks:read',
  'notifications:read',
])

export const TIER_PERMISSION_ALLOWLIST = Object.freeze({
  OPERATOR: OPERATOR_PERMISSION_ALLOWLIST,
  TRAINEE: TRAINEE_PERMISSION_ALLOWLIST,
})

/** The '<module>:<action>' grants a role of this tier may NOT hold, out of `permissions`. */
export function permissionsOutsideTier(tier, permissions) {
  const allow = TIER_PERMISSION_ALLOWLIST[tier]
  if (!allow) return []
  const set = new Set(allow)
  return [...new Set(permissions.filter((p) => !set.has(p)))].sort()
}
