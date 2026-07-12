/**
 * Platform Console API — cross-tenant control-plane calls.
 *
 * These are NOT syncEngine entity CRUD: the responses are cross-tenant admin
 * data (company directory, operators, audit trail), not per-company synced
 * model records, and they live outside tenant RLS. So per CLAUDE.md rule #4
 * exception they use the axios helpers directly. Every mutation is audited
 * server-side in platform_audit_log.
 *
 * All endpoints are gated by requirePlatformAdmin() on the backend; the FE menu
 * gate (isPlatformAdmin) is convenience only.
 */
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { get, post, del } from '@/api'

// ── Tenants ──────────────────────────────────────────────────────────────────
export function listCompanies(search) {
  return get('/v1/platform/companies', { params: search ? { search } : {}, loader: false })
}

export function getCompany(id) {
  return get(`/v1/platform/companies/${id}`, { loader: false })
}

export function listCompanyUsers(id, search) {
  return get(`/v1/platform/companies/${id}/users`, {
    params: search ? { search } : {},
    loader: false,
  })
}

export function setCompanyStatus(id, status, reason) {
  return post(
    `/v1/platform/companies/${id}/status`,
    { status, reason },
    { showSuccess: 'Tenant status updated' },
  )
}

// ── Operators ────────────────────────────────────────────────────────────────
export function listPlatformAdmins() {
  return get('/v1/platform/admins', { loader: false })
}

export function grantPlatformAdmin({ email, userId, role }) {
  return post(
    '/v1/platform/admins',
    { email, userId, role },
    { showSuccess: 'Platform operator saved' },
  )
}

export function revokePlatformAdmin(id) {
  return del(`/v1/platform/admins/${id}`, { showSuccess: 'Platform operator revoked' })
}

// ── Audit ────────────────────────────────────────────────────────────────────
export function listPlatformAudit(limit = 100) {
  return get('/v1/platform/audit', { params: { limit }, loader: false })
}

// Tenant lifecycle states + display metadata, shared by console pages.
export const COMPANY_STATUSES = [
  { id: 'active', label: 'Active', class: 'tw:bg-green-100 tw:text-green-700' },
  { id: 'trial', label: 'Trial', class: 'tw:bg-blue-100 tw:text-blue-700' },
  { id: 'suspended', label: 'Suspended', class: 'tw:bg-amber-100 tw:text-amber-700' },
  { id: 'locked', label: 'Locked', class: 'tw:bg-red-100 tw:text-red-700' },
  { id: 'cancelled', label: 'Cancelled', class: 'tw:bg-gray-200 tw:text-gray-600' },
]

// Platform operator roles (rank-ordered), mirrors backend PLATFORM_RANK.
export const PLATFORM_ROLES = [
  { id: 'readonly', label: 'Read-only' },
  { id: 'support', label: 'Support' },
  { id: 'admin', label: 'Admin' },
  { id: 'owner', label: 'Owner' },
]
