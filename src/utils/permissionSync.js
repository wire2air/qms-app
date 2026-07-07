/**
 * Live permission refresh.
 *
 * A user's effective permissions ride on the session payload fetched at boot and
 * were previously never refreshed — so when an admin changed a role, the affected
 * users kept stale access until a full page reload. This wires the syncEngine's
 * change stream to a lightweight session re-fetch: whenever a role / role
 * assignment / permission-grant record changes (these tables all carry audit
 * triggers, so their edits broadcast over the `sync` socket to every user in the
 * company), we re-pull the current user's permissions and, if they can no longer
 * view the page they're on, redirect them to /no-access.
 *
 * Note: socketSubscriber emits a syncBus event even when the record fetch is
 * RLS-denied (returns null), so this fires for every company user, not just those
 * who can read the role/permission tables.
 */
import { syncBus } from '@syncEngine/core/syncBus.js'
import router from '@/router'
import { refreshPermissions } from '@/utils/currentSession'
import { evaluateRoute } from '@/router/permissionGuard'

// Models whose changes can alter someone's effective permissions.
const PERMISSION_MODELS = ['Role', 'RoleOnUser', 'PermissionOnRole', 'Permission']

const REFRESH_DEBOUNCE_MS = 400

let unsubscribes = []
let debounceTimer = null

async function refreshAndReguard() {
  await refreshPermissions()
  // If the just-updated permissions revoke access to the current page, bounce.
  const decision = evaluateRoute(router.currentRoute.value)
  if (decision !== true) await router.replace(decision)
}

function scheduleRefresh() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(refreshAndReguard, REFRESH_DEBOUNCE_MS)
}

/**
 * Start listening for permission-affecting sync events. Idempotent.
 */
export function initPermissionSync() {
  teardownPermissionSync()
  unsubscribes = PERMISSION_MODELS.map((model) => syncBus.on(model, scheduleRefresh))
}

/**
 * Stop listening (call on logout / company switch / teardown).
 */
export function teardownPermissionSync() {
  clearTimeout(debounceTimer)
  unsubscribes.forEach((off) => off?.())
  unsubscribes = []
}
