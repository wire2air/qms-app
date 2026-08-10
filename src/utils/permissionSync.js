/**
 * Live permission refresh.
 *
 * A user's effective permissions ride on the session payload fetched at boot and
 * were previously never refreshed — so when an admin changed a role, the affected
 * users kept stale access until a full page reload. This wires the syncEngine's
 * change stream to a lightweight session re-fetch: whenever a role or a role
 * assignment changes (both are public tables carrying the audit trigger, so their
 * edits broadcast over the `sync` socket to every user in the company), we
 * re-pull the current user's permissions and, if they can no longer view the page
 * they're on, redirect them to /no-access.
 *
 * It now covers a change to the grants themselves too. That took a backend
 * change, because `authz.role_module_permissions` can produce no ordinary sync
 * event — `saveRolePermissions` enqueues one explicit `sync_broadcast` per save
 * and `socketSubscriber` turns it into a record-less `RoleModulePermission`
 * signal. See the note on PERMISSION_MODELS below (F-03).
 *
 * Note: socketSubscriber emits a syncBus event even when the record fetch is
 * RLS-denied (returns null), so this fires for every company user, not just those
 * who can read the role/permission tables.
 *
 * When the current user's OWN effective permissions actually change, we flip
 * `permissionsChanged` so the app can prompt a full reload — the in-memory
 * refresh updates permission *checks*, but data the syncEngine already
 * bootstrapped into IndexedDB (under the old permissions) is only re-fetched on
 * a hard reload, so newly-granted modules would otherwise show empty.
 */
import { syncBus } from '@syncEngine/core/syncBus.js'
import router from '@/router'
import { refreshPermissions } from '@/utils/currentSession'
import { evaluateRoute } from '@/router/permissionGuard'

// Reactive flag: true when this user's permissions changed since page load.
// A component (PermissionChangeDialog) watches it to prompt a reload.
export const permissionsChanged = ref(false)

// Models whose changes can alter someone's effective permissions AND actually
// reach this browser.
//
// `PermissionOnRole` and `Permission` used to be listed here. Neither has a
// model class in models/ — they are retired names from the pre-authz schema, so
// `syncBus.on()` registered two listeners on channels nothing can ever emit on.
// They read like coverage and were no-ops; removed rather than left as decoration.
//
// `Role` covers the role row (rename / status / lock / soft-delete) and
// `RoleOnUser` covers who holds a role. `RoleModulePermission` covers the grants
// themselves — which module, which action, at which scope.
//
// That third one is not a model and there is no such table on the client. It is
// a SIGNAL (F-03). The grants live in `authz.role_module_permissions`, which can
// never produce an ordinary sync event, for three independent reasons:
//
//   1. It is in the `authz` schema. The baseline audit-trigger migration
//      attaches audit_trigger() only where table_schema = 'public', so there is
//      no trigger on it.
//   2. Grant writes are ledgered by `authz.set_permission` into
//      `authz.permission_audit_log`, not `public.audit_logs` — so the
//      audit_logs broadcast never fires for them either.
//   3. PostGraphile exposes `schemas: ['public']`, so the table has no GraphQL
//      type — a @ClientModel for it could not be bootstrapped or fetched.
//
// So `saveRolePermissions` enqueues one `sync_broadcast` job per save (not per
// changed cell), and `socketSubscriber`'s SIGNAL_ONLY_TABLES map turns it into a
// bare `RoleModulePermission` event with no record attached. This composable
// only ever needed the FACT that grants moved, never the row.
//
// Scope, stated plainly: this refreshes permission CHECKS. Records already
// bootstrapped into IndexedDB under the old permissions are re-fetched on a hard
// reload, which is what `permissionsChanged` prompts for. The deliverable is
// "the affected user is told, or is bounced off a page they can no longer see",
// not "everything silently self-corrects".
// Exported for the guard in permissionSync.spec.js: every name here must be
// either a real model or a declared signal. Two of the four names this list
// started with were retired models, and nothing noticed for months, because a
// syncBus subscription to a name nobody emits is silent — it does not throw, it
// just never fires.
export const PERMISSION_MODELS = ['Role', 'RoleOnUser', 'RoleModulePermission']

const REFRESH_DEBOUNCE_MS = 400

let unsubscribes = []
let debounceTimer = null

async function refreshAndReguard() {
  const { changed } = await refreshPermissions()
  if (changed) permissionsChanged.value = true
  // If the just-updated permissions revoke access to the current page, bounce
  // immediately (don't wait for the user to accept the reload prompt).
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
  permissionsChanged.value = false
}
