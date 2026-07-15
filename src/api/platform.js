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
import { get, post, patch, del } from '@/api'

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

// ── Credential support ops (on a tenant user) ────────────────────────────────
export function sendUserPasswordReset(companyId, userId, reason) {
  return post(
    `/v1/platform/companies/${companyId}/users/${userId}/send-password-reset`,
    { reason },
    { showSuccess: 'Password reset email sent' },
  )
}

export function unlockUser(companyId, userId, reason) {
  return post(
    `/v1/platform/companies/${companyId}/users/${userId}/unlock`,
    { reason },
    { showSuccess: 'Account unlocked' },
  )
}

export function resetUserMfa(companyId, userId, reason) {
  return post(
    `/v1/platform/companies/${companyId}/users/${userId}/reset-mfa`,
    { reason },
    { showSuccess: 'MFA reset' },
  )
}

// ── Entitlements (C2) — a tenant's plan + per-module overrides ───────────────
export function getCompanyEntitlements(id) {
  return get(`/v1/platform/companies/${id}/entitlements`, { loader: false })
}

export function setCompanyPlan(id, planId) {
  return post(`/v1/platform/companies/${id}/plan`, { planId }, { showSuccess: 'Plan updated' })
}

// enabled: true (add-on) · false (remove) · null (clear override → revert to plan)
export function setCompanyModule(id, moduleId, enabled) {
  return post(
    `/v1/platform/companies/${id}/modules/${moduleId}`,
    { enabled },
    { showSuccess: 'Module entitlement updated' },
  )
}

// ── QMS defaults seeding (built-in ISO baseline) ─────────────────────────────
// Seed a tenant's built-in defaults (Main Site, roles, workflow/document/form
// templates, lookups, audit library, onboarding training). Additive +
// idempotent server-side: only missing rows are inserted. View = support;
// seeding = admin. Audited (COMPANY_SEED_DEFAULTS).
export function listSeedModules() {
  return get('/v1/platform/seed-modules', { loader: false })
}

// modules: array of module keys (deps auto-included) or null/empty for the full
// baseline. source: 'defaults' (built-in ISO baseline) or a source companyId to
// clone that company's config for the selected modules. Returns
// { seeded, company, source, appliedModules }.
export function seedCompanyDefaults(id, modules, source = 'defaults') {
  return post(`/v1/platform/companies/${id}/seed-defaults`, {
    modules: modules?.length ? modules : null,
    source: source || 'defaults',
  })
}

// ── Plan catalog (global) ────────────────────────────────────────────────────
export function listPlans() {
  return get('/v1/platform/plans', { loader: false })
}

export function createPlan(payload) {
  return post('/v1/platform/plans', payload, { showSuccess: 'Plan created' })
}

export function updatePlan(planId, patchBody) {
  return patch(`/v1/platform/plans/${planId}`, patchBody, { showSuccess: 'Plan updated' })
}

export function addPlanModule(planId, moduleId) {
  return post(`/v1/platform/plans/${planId}/modules/${moduleId}`, {}, { loader: false })
}

export function removePlanModule(planId, moduleId) {
  return del(`/v1/platform/plans/${planId}/modules/${moduleId}`, { loader: false })
}

// ── Step-up re-authentication ─────────────────────────────────────────────────
// Refreshes the operator's step-up marker so a privileged action (purge, legal
// hold, approval) is allowed. The server 403s STEP_UP_REQUIRED until this runs.
export function platformStepUp({ password }) {
  return post('/v1/platform/step-up', { password })
}

// ── Governance / safety (destructive-op approvals, blast radius, legal hold) ──
export function getBlastRadius(id) {
  return get(`/v1/platform/companies/${id}/blast-radius`, { loader: false })
}

export function requestCompanyPurge(id, { reason, delayHours }) {
  return post(
    `/v1/platform/companies/${id}/purge-request`,
    { reason, delayHours },
    { showSuccess: 'Purge requested — awaiting a second operator’s approval' },
  )
}

export function setLegalHold(id, hold, reason) {
  return post(
    `/v1/platform/companies/${id}/legal-hold`,
    { hold, reason },
    { showSuccess: hold ? 'Legal hold placed' : 'Legal hold cleared' },
  )
}

export function listApprovals(status) {
  return get('/v1/platform/approvals', { params: status ? { status } : {}, loader: false })
}

export function approveApproval(id) {
  return post(`/v1/platform/approvals/${id}/approve`, {}, { showSuccess: 'Request approved' })
}

export function rejectApproval(id, reason) {
  return post(
    `/v1/platform/approvals/${id}/reject`,
    { reason },
    { showSuccess: 'Request rejected' },
  )
}

export function cancelApproval(id, reason) {
  return post(
    `/v1/platform/approvals/${id}/cancel`,
    { reason },
    { showSuccess: 'Request cancelled' },
  )
}

// Approval lifecycle states + display metadata.
export const APPROVAL_STATUSES = [
  { id: 'pending', label: 'Pending', class: 'tw:bg-amber-100 tw:text-amber-700' },
  { id: 'approved', label: 'Approved (scheduled)', class: 'tw:bg-blue-100 tw:text-blue-700' },
  { id: 'executed', label: 'Executed', class: 'tw:bg-gray-800 tw:text-white' },
  { id: 'rejected', label: 'Rejected', class: 'tw:bg-red-100 tw:text-red-700' },
  { id: 'cancelled', label: 'Cancelled', class: 'tw:bg-gray-200 tw:text-gray-600' },
  { id: 'failed', label: 'Failed / vetoed', class: 'tw:bg-red-100 tw:text-red-700' },
]

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
