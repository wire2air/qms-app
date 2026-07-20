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
 *  - Routes with no entry here are open (dashboard, equipment, task
 *    instances, …) — same as the sidebar showing them with no permission gate.
 */
import { isAllowed, currentSession, isSupplier, isPlatformAdmin } from '@/utils/currentSession'

// Admin / configuration modules — guarded across the whole subtree (list + detail).
// key = first path segment, value = required permission.
const ADMIN_PERMISSIONS = {
  users: 'user_management:read',
  roles: 'role_permission_management:read',
  groups: 'teams:read',
  sites: 'sites:read',
  departments: 'departments:read',
  suppliers: 'supplier_management:read',
  products: 'products:read',
  templates: 'forms_templates:read',
  'form-templates': 'forms_templates:read',
  'workflow-templates': 'workflows_templates:read',
  'document-templates': 'document_templates:read',
  'rca-templates': 'rca_templates:read',
  'risk-assessment-templates': 'risk_assessment_templates:read',
  'automation-rules': 'automation_rules:manage',
  'custom-fields': 'custom_fields:manage',
  'complaint-settings': 'complaint_management:update',
  'notification-rules': 'company_settings:manage',
  lookups: 'company_settings:manage',
  settings: 'company_settings:manage',
  'organization-security': 'security:manage',
  'admin-security': 'security:manage',
  'vendor-access-log': 'security:manage',
}

// Record modules — guard the LIST route only; detail routes defer to RLS so
// assignees / shared users keep their row-level access.
const RECORD_LIST_PERMISSIONS = {
  documents: 'document_control:read',
  nonconformances: 'ncr:read',
  qualityEvents: 'quality_events:read',
  'customer-complaints': 'complaint_management:read',
  // Standalone QMS quality complaints (the `complaints` table) — a separate
  // module from Customer Complaints above; mirrors the sidebar's `complaints:read`
  // gate so direct-URL access to /complaints is blocked without the permission.
  complaints: 'complaints:read',
  capas: 'capa:read',
  'change-requests': 'change_control:read',
  audits: 'audit_management:read',
  records: 'records:read',
  trainings: 'training:read',
  'training-instances': 'training_instances:read',
  'training-verifications': 'training_verifications:read',
  'training-curriculum': 'training:read',
  'training-reports': 'training_instances:read',
  'inspections-logs': 'field_records:create',
  'qc-inspection': 'inspection_qc:read',
  logging: 'field_records:create',
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

  // Platform-admin control plane — the /platform console AND impersonation
  // (/admin/impersonate) are cross-tenant capabilities gated on platform-admin
  // standing, not company permissions. Blocked for everyone else, including
  // suppliers. The backend re-checks every call regardless (requirePlatformAdmin).
  if (seg === 'platform' || to.path.startsWith('/admin/impersonate')) {
    if (isPlatformAdmin.value) return true
    return { path: NO_ACCESS_PATH, query: { from: to.fullPath } }
  }

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
