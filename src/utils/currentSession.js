import { ref, computed } from 'vue'
import { apiClient } from '@/api/client.js'
import { isPublicRoute } from '@/constants/authRoutes.js'
import { deleteAllSyncDatabases } from '@/utils/initSyncEngine.js'

// Unique identifier for the current tab
export const TAB_ID = `tab-${crypto.randomUUID()}`

// Local storage key for inter-tab communication
export const tabMessage = useLocalStorage('tabMessage', null)

// Watch for changes in the tabMessage to handle incoming messages
watch(tabMessage, (newMessageJSON) => {
  const messageObj = JSON.parse(newMessageJSON)
  const { origin, message } = messageObj

  // Ignore messages originating from the same tab
  if (origin === TAB_ID) return

  // Handle logout message
  if (message === 'logout') {
    window.location.href = '/signin'
  }
})

// Function to send a message to other tabs
function sendTabMessage(message) {
  tabMessage.value = JSON.stringify({ origin: TAB_ID, message })
}

// Create a mutable ref to store the current user data
export const companyCode = ref(null)
export const currentSession = ref(undefined) // undefined  = unknown, null = logged out
export const permissions = computed(() => currentSession.value?.permissions || [])
export const isSuperUser = computed(() => {
  const email = currentSession.value?.email
  if (!email) return false
  return email.endsWith('@qms.com')
})

// EXTERNAL_SUPPLIER users get a stripped-down sidebar + a dedicated
// /[code]/supplier dashboard. Mirrors the backend's `users.kind` column
// and the per-company `kind` field on the session payload.
export const isSupplier = computed(() => {
  return currentSession.value?.kind === 'EXTERNAL_SUPPLIER'
})

// AI sidecar gate. True when BOTH the global env switch
// (AI_MODULE_ENABLED) AND the active company's company_ai_profile.enabled
// flag are true — resolved server-side in /v1/services/auth/session and
// echoed on the session payload as `aiEnabled`. UI affordances that
// invoke AI tasks (AI Generate, AI Assist Import, chat panel, etc.)
// should v-if on canUseAi so tenants without the add-on never see them.
export const canUseAi = computed(() => !!currentSession.value?.aiEnabled)

// Entitlement plane (C2) — the module ids the active tenant's plan includes,
// resolved server-side in /v1/auth/session as `entitledModules: string[]`. This
// is the COMMERCIAL gate (did the tenant buy the module?), distinct from RBAC
// permissions (may this user act within it?). UI convenience only: every
// entitlement-gated REST route re-checks via requireEntitlement() server-side.
export const entitledModules = computed(() => currentSession.value?.entitledModules || null)

// True when the tenant's plan includes `moduleId`. Fail-open: if the session
// carries no entitledModules (e.g. a session cached before this shipped, or the
// backend fail-open for a tenant with no subscription), everything is allowed —
// so this never hides a module that authz already permits by mistake.
export function isModuleEntitled(moduleId) {
  const list = entitledModules.value
  if (!list) return true
  return list.includes(moduleId)
}

export const isAdmin = computed(() => {
  const email = currentSession.value?.email
  if (!email) return false
  const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return adminEmails.includes(email.toLowerCase())
})

// Platform-admin (control plane) standing — cross-tenant, resolved server-side
// in /v1/auth/session as `platformAdmin: { role } | null`. Gates the Platform
// Console menu + /platform routes. UI convenience only: every /v1/platform/*
// endpoint re-checks via requirePlatformAdmin, so a forged flag buys nothing.
export const platformRole = computed(() => currentSession.value?.platformAdmin?.role || null)
export const isPlatformAdmin = computed(() => !!platformRole.value)

// Rank ladder mirrors backend services/platformAdminService.js PLATFORM_RANK.
const PLATFORM_RANK = { readonly: 1, support: 2, admin: 3, owner: 4 }

// True when the current platform role meets a minimum tier (e.g. 'admin' to set
// tenant status, 'owner' to grant/revoke operators). Drives which console
// actions render — the backend is still the authority.
export function hasPlatformRole(minRole = 'readonly') {
  const rank = PLATFORM_RANK[platformRole.value] || 0
  return rank >= (PLATFORM_RANK[minRole] || 99)
}

// Add computed properties for impersonation
export const isImpersonating = computed(() => {
  return !!currentSession.value?.impersonator
})

// Impersonation access mode — 'readonly' (default, all writes blocked server-
// side) or 'write'. Drives the banner so the operator can never mistake which
// mode they're in.
export const impersonationMode = computed(
  () => currentSession.value?.impersonator?.mode || 'readonly',
)
export const isReadOnlyImpersonation = computed(
  () => isImpersonating.value && impersonationMode.value === 'readonly',
)

export const originalUserName = computed(() => {
  if (!currentSession.value?.impersonator) return 'Admin'

  const firstName = currentSession.value.impersonator.originalFirstName || ''
  const lastName = currentSession.value.impersonator.originalLastName || ''

  if (firstName || lastName) {
    return `${firstName} ${lastName}`.trim()
  }

  return 'Admin'
})

// Function to return to the original admin user
export function returnToOriginalUser() {
  if (!isImpersonating.value) return
  window.location.href = '/api/v1/auth/return-from-impersonation'
}

export const logoutCurrentSession = async () => {
  // Use apiClient directly with _retried flag to bypass the 401 interceptor
  // retry logic — the signout endpoint is expected to invalidate the session.
  try {
    await apiClient.put('/v1/auth/signout', undefined, { _retried: true })
  } catch {
    // Ignore errors — we're logging out regardless
  }

  // Wipe all company-scoped IndexedDB databases
  await deleteAllSyncDatabases()

  sessionStorage.removeItem('isLogin')
  sendTabMessage('logout')
  window.location = '/signin'
}

export async function hydrateSession() {
  return await fetchUserSession({ hydrate: true })
}

/**
 * Re-fetch ONLY the current user's effective permissions from the session
 * endpoint and update the in-memory session, without the full re-boot that
 * initSession() does. `/v1/auth/session` recomputes permissions from the DB on
 * every call, so this picks up role/permission changes made by an admin while
 * the user is logged in — the fix for stale permissions that previously required
 * a full page reload. Best-effort: on failure the old permissions stand (a hard
 * reload still refreshes them).
 */
export async function refreshPermissions() {
  if (!currentSession.value) return { changed: false }
  try {
    const response = await apiClient.get('/v1/auth/session', { _retried: true })
    const session = response.data?.session
    if (!session || !Array.isArray(session.permissions)) return { changed: false }

    const prev = currentSession.value.permissions || []
    const next = session.permissions
    const nextIsOwner = session.isOwner ?? currentSession.value.isOwner
    const changed =
      prev.length !== next.length ||
      [...prev].sort().join('\u0000') !== [...next].sort().join('\u0000') ||
      nextIsOwner !== currentSession.value.isOwner

    currentSession.value = {
      ...currentSession.value,
      permissions: next,
      isOwner: nextIsOwner,
    }
    return { changed }
  } catch {
    // Ignore — keep existing permissions until the next successful refresh/reload.
    return { changed: false }
  }
}

async function fetchUserSession(options = {}) {
  // Subdomain tenancy: the backend resolves the active company from the request
  // host (acme.qability.com), so no companyCode query param is sent anymore.
  const url = options.hydrate ? '/v1/auth/hydrateSession' : '/v1/auth/session'

  try {
    // Use raw axios with _retried flag to bypass the 401 interceptor
    // retry logic — fetchUserSession handles auth failures itself.
    const response = await apiClient.get(url, { _retried: true })

    // Handle 304 Not Modified
    if (response.status === 304 && options.hydrate) {
      return null // No changes, all good
    }

    const data = response.data

    // Session may not have a company yet
    const session = data.session

    // Use activeCompanyId from session (set by backend when companyCode is passed)
    if (!session.activeCompanyId) {
      currentSession.value = session
      return
    }

    const activeCompanyId = session.activeCompanyId
    const activeCompany = session.companies?.[activeCompanyId]

    if (!activeCompany) {
      currentSession.value = null
      return
    }

    const newCurrentSession = {
      id: activeCompany.userId,
      ...session,
      ...activeCompany,
      companyId: activeCompanyId,
    }

    currentSession.value = newCurrentSession
  } catch (err) {
    const status = err?.status ?? err?.raw?.response?.status

    // 403 = authenticated, but no access to the requested company. Don't
    // bounce to /signin — the user is logged in. Leave currentSession null
    // and let App.vue redirect into a company they actually belong to.
    if (status === 403) {
      currentSession.value = null
      return null
    }

    // 401 / network / unknown → fall back to the login page.
    const path = window.location.pathname
    if (!isPublicRoute(path) && path !== '/app') {
      window.location.href = '/signin'
    }
    return null
  }
}

export async function initSession(initCompanyCode) {
  if (initCompanyCode) {
    companyCode.value = initCompanyCode
  }
  return await fetchUserSession()
}

export function isAllowed(neededPermissions) {
  if (!currentSession.value) {
    return false
  }

  // Owners bypass per-permission checks.
  if (currentSession.value.isOwner) return true

  const userPermissions = permissions.value

  return neededPermissions.every((perm) => userPermissions.includes(perm))
}

/**
 * True when the session holds ANY write capability (non-read action) on the
 * module. The session's permission strings materialize every granted verb
 * ('module:action') plus the implied 'module:read' (backend
 * authz.effective_permission_strings), so scanning for any non-read string is
 * exact. Owner bypass mirrors isAllowed.
 *
 * Drives write-gated nav items (MainSidebar `writeGate`): a read-only grant
 * exists so pickers and reference reads work — it is not an invitation to
 * browse the module's authoring page. Declutter, not security — the routes
 * stay reachable by direct link (qms docs/backend/permissions-model.md §3).
 */
export function hasWriteOn(moduleId) {
  if (!currentSession.value) return false
  if (currentSession.value.isOwner) return true
  const prefix = `${moduleId}:`
  return permissions.value.some((p) => p.startsWith(prefix) && p !== `${prefix}read`)
}

/**
 * Gate a WORKFLOW VERB (close / approve / reject / reopen / assign / export).
 *
 * These aren't SQL DML, so RLS can't enforce them — the app must. Their routes
 * pair a baseline `enforcePermission(module, 'update')` with a
 * `requirePermission(module, verb)` that is dormant until AUTHZ_VERBS_ENABLED.
 * This mirrors that pairing exactly, in both flag states, so the button and the
 * API always agree:
 *
 *   flag off → API needs :update          → gate on :update
 *   flag on  → API needs :update + :verb  → gate on both
 *
 * Gating on the verb unconditionally would hide buttons from every existing
 * role that holds only :update (they were granted before verbs were enforced);
 * gating on :update forever would leave the verb grants decorative — which is
 * exactly how a role without :close could still close a complaint.
 */
export function isVerbAllowed(module, verb) {
  const needed = currentSession.value?.authzVerbsEnabled
    ? [`${module}:update`, `${module}:${verb}`]
    : [`${module}:update`]
  return isAllowed(needed)
}
