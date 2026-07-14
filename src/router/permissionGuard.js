/**
 * Route-level permission guard.
 *
 * The SPA previously enforced permissions ONLY cosmetically — the sidebar hid
 * links and pages hid action buttons — but nothing stopped a user from typing a
 * module URL (or using the ⌘K palette / a shared deep link) to load a page they
 * have no permission for. This guard closes that gap: it maps each protected
 * route to the permission the sidebar already requires for its nav entry, and
 * redirects unauthorized users to `/no-access`.
 *
 * Design rules (mirrors MainSidebar.vue + backend RLS intent):
 *  - Owners bypass every check (handled inside `isAllowed`).
 *  - ADMIN modules (users, roles, settings, …) are guarded for the whole
 *    subtree — list AND detail — because there is no row-level RLS exception:
 *    if you can't read the module, you can't see any of its records.
 *  - RECORD modules (documents, capas, audits, …) guard ONLY the list route.
 *    Their detail routes are left to backend RLS, which grants row-level access
 *    to assignees / collaborators / shared users who legitimately lack the
 *    module-wide `:read` permission (e.g. an auditor assigned to one audit).
 *  - EXTERNAL_SUPPLIER users get their own allow-list: the record modules RLS
 *    shares with them stay open, every admin module is blocked.
 *  - Routes with no entry here are open (dashboard, equipment, sites, task
 *    instances, …) — same as the sidebar showing them with no permission gate.
 */
import { isAllowed, currentSession, isSupplier } from '@/utils/currentSession'

// Admin / configuration modules — guarded across the whole subtree (list + detail).
// key = first path segment, value = required permission.
const ADMIN_PERMISSIONS = {
  users: 'users:read',
  roles: 'roles:read',
  groups: 'teams:read',
  suppliers: 'suppliers:read',
  products: 'products:read',
  templates: 'formTemplates:read',
  'form-templates': 'formTemplates:read',
  'workflow-templates': 'workflows:read',
  'document-templates': 'document-templates:read',
  'rca-templates': 'rcaTemplates:read',
  'risk-assessment-templates': 'riskAssessmentTemplates:read',
  'automation-rules': 'automationRules:manage',
  'custom-fields': 'customFields:manage',
  'complaint-settings': 'customerComplaints:update',
  'notification-rules': 'company:manage',
  lookups: 'company:manage',
  settings: 'company:manage',
  'organization-security': 'security:manage',
  'admin-security': 'security:manage',
}

// Record modules — guard the LIST route only; detail routes defer to RLS so
// assignees / shared users keep their row-level access.
const RECORD_LIST_PERMISSIONS = {
  documents: 'documents:read',
  nonconformances: 'nonconformances:read',
  qualityEvents: 'qualityEvents:read',
  'customer-complaints': 'customerComplaints:read',
  capas: 'capas:read',
  'change-requests': 'changeRequests:read',
  audits: 'audits:read',
  records: 'records:read',
  trainings: 'trainings:read',
  'training-instances': 'trainingInstances:read',
  'training-verifications': 'trainingVerifications:read',
  'training-curriculum': 'trainingCurriculum:read',
  'training-reports': 'trainingInstances:read',
  'inspections-logs': 'fieldRecords:create',
  'qc-inspection': 'qcInspection:lot:read',
  logging: 'fieldRecords:create',
}

// Record modules an EXTERNAL_SUPPLIER may reach even without the module `:read`
// permission (RLS scopes the rows shared with them). Everything guarded that is
// NOT in this set is blocked for suppliers.
const SUPPLIER_EXEMPT_SEGMENTS = new Set([
  'documents',
  'nonconformances',
  'capas',
  'qualityEvents',
  'audits',
  'm', // admin-defined modules (form-template driven) shared with the supplier
])

const NO_ACCESS_PATH = '/no-access'

function firstSegment(path) {
  return path.split('/').filter(Boolean)[0] || ''
}

// Path segments that mean "the create/new form" (e.g. /documents/create).
// Record ids are UUIDs, so these never collide with a real detail route.
const CREATE_SEGMENTS = new Set(['create', 'new'])

// Derive the create permission from a module's base (list) permission:
// `documents:read` → `documents:create`; a `:manage`/`:create`/`:update` gate
// (settings, automation-rules, inspections-logs…) already covers creation, so
// use it as-is.
function createPermissionFrom(basePerm) {
  return basePerm.endsWith(':read') ? basePerm.replace(/:read$/, ':create') : basePerm
}

/**
 * Resolve the permission required to view `to`, or null if the route is open.
 * @param {import('vue-router').RouteLocationNormalized} to
 * @returns {string|null}
 */
export function requiredPermissionFor(to) {
  const segs = to.path.split('/').filter(Boolean)
  const seg = segs[0]
  if (!seg) return null

  // Admin-defined modules: /m/:internalName (…/create → `${internalName}:create`).
  if (seg === 'm') {
    const internalName = segs[1]
    if (!internalName) return null
    return CREATE_SEGMENTS.has(segs[2]) ? `${internalName}:create` : `${internalName}:read`
  }

  const basePerm = ADMIN_PERMISSIONS[seg] || RECORD_LIST_PERMISSIONS[seg]
  if (!basePerm) return null

  // Create/new page: require the module's create permission, so a user without
  // it can't reach the form even by direct URL (segs like /documents/create).
  if (CREATE_SEGMENTS.has(segs[1])) return createPermissionFrom(basePerm)

  // Admin subtree — list and detail both gated on the base permission.
  if (ADMIN_PERMISSIONS[seg]) return basePerm

  // Record modules — only the bare list route is gated; detail defers to RLS.
  const normalized = to.path.replace(/\/+$/, '')
  return normalized === `/${seg}` ? basePerm : null
}

/**
 * Decide whether navigation to `to` is permitted for the current session.
 * Returns `true` to allow, or a redirect location to block.
 */
export function evaluateRoute(to) {
  // Never guard the no-access page itself (avoid redirect loops).
  if (to.path === NO_ACCESS_PATH) return true

  // Session not yet resolved (undefined) or logged out (null): let App.vue's
  // boot flow handle auth/tenant redirects. We only gate authenticated users.
  if (!currentSession.value) return true

  const seg = firstSegment(to.path)

  // EXTERNAL_SUPPLIER: allow their RLS-shared record modules, block admin routes.
  if (isSupplier.value) {
    if (SUPPLIER_EXEMPT_SEGMENTS.has(seg)) return true
    if (ADMIN_PERMISSIONS[seg] || RECORD_LIST_PERMISSIONS[seg]) {
      return { path: NO_ACCESS_PATH, query: { from: to.fullPath } }
    }
    return true
  }

  const permission = requiredPermissionFor(to)
  if (!permission) return true
  if (isAllowed([permission])) return true

  return { path: NO_ACCESS_PATH, query: { from: to.fullPath } }
}

/**
 * Register the permission guard on the router instance.
 * @param {import('vue-router').Router} router
 */
export function installPermissionGuard(router) {
  router.beforeEach((to) => evaluateRoute(to))
}
