<script setup>
import { initSession, currentSession, canUseAi } from '@/utils/currentSession'
import { initCurrentCompany, companies } from '@/utils/currentCompany'
import { isPublicRoute as isPublicRouteFn, isAuthRoute } from '@/constants/authRoutes'
import { initSync, deleteAllSyncDatabases } from '@/utils/initSyncEngine.js'
import { currentSubdomain, gotoTenant, apexOrigin } from '@/utils/tenant'
import { provideDataTablePersist } from '@/composables/useDataTablePersist'
import { evaluateRoute } from '@/router/permissionGuard'
import { initPermissionSync } from '@/utils/permissionSync'

const pageInfo = ref({
  showHeader: true,
})
providePageInfo(pageInfo)

// B7 — route-metadata: keep document.title in sync with the route (registry in
// src/router/routeMeta.js). Unmatched routes fall back to the bare app name.
useRouteMeta()

// C4 — register "Go to X" navigation commands for the ⌘K/⌘P palette.
useNavigationCommands()

const route = useRoute()
const openRoutes = ['/form']
const loading = ref(true)

// Wire <DataTable persistKey> view-state persistence to the synced User.settings
// bag (IndexedDB + cross-device). Gated on `!loading` so the User query waits
// until the syncEngine's IndexedDB is installed (querying earlier throws).
provideDataTablePersist(() => !loading.value)
const showFormBuilder = computed(() => {
  return route.name === '/templates/[[id]]' && route.query.mode === 'schema'
})
const currentPath = window.location.pathname
const isOpenRoute = openRoutes.some(
  (route) => currentPath === route || currentPath.startsWith(`${route}/`),
)
// Public routes (signin, signup, …) render on any host and need no tenant.
const isPublicRoute = isPublicRouteFn(currentPath)

// ── Route-level navigation progress ──────────────────────────────────────────
// With importMode 'async', each page is a lazy chunk that downloads on first
// visit — without feedback that gap reads as a freeze/glitch. Show a thin top
// progress bar while navigating. The 120ms delay means instant (cached-chunk)
// navigations don't flash it; only real chunk downloads show the bar.
const router = useRouter()
const navigating = ref(false)
let navDelayTimer = null
router.beforeEach(() => {
  navDelayTimer = setTimeout(() => (navigating.value = true), 120)
})
function endNavigation() {
  clearTimeout(navDelayTimer)
  navigating.value = false
}
router.afterEach(endNavigation)
router.onError(endNavigation)

// Prefetch a route's lazy chunk when the user hovers any internal link, so by
// the time they click it's already cached and navigation is instant. One
// global listener covers every RouterLink; each chunk loads at most once.
const prefetchedPaths = new Set()
function prefetchRouteChunk(path) {
  if (!path || prefetchedPaths.has(path)) return
  prefetchedPaths.add(path)
  try {
    for (const record of router.resolve(path).matched) {
      const loader = record.components?.default
      if (typeof loader === 'function') loader() // triggers the dynamic import()
    }
  } catch {
    // unresolvable href — ignore
  }
}
function onLinkHover(e) {
  const a = e.target?.closest?.('a[href^="/"]')
  if (a) prefetchRouteChunk(a.getAttribute('href'))
}
onMounted(() => document.addEventListener('mouseover', onLinkHover, { passive: true }))
onBeforeUnmount(() => document.removeEventListener('mouseover', onLinkHover))

// Subdomain tenancy: the active tenant is the request host (acme.qability.com),
// not a path segment. null on apex / reserved hosts (localhost, admin.*, …).
const subdomain = currentSubdomain()

async function bootApp() {
  if (isOpenRoute) return

  if (isPublicRoute) {
    // Signup is not tenant-scoped — it only renders on the apex host. A tenant
    // subdomain forwards to the apex signup before any session logic runs.
    if (currentPath.startsWith('/signup') && subdomain) {
      window.location.assign(`${apexOrigin()}/signup`)
      return
    }

    // Public/auth pages render on any host. If already authenticated and on an
    // auth page, forward into the user's tenant app (its own subdomain).
    // /signup is exempt: the signup page owns its session handling (it renders
    // the add-workspace flow for company-less users and forwards the rest).
    await initSession()
    if (currentSession.value && isAuthRoute(currentPath) && !currentPath.startsWith('/signup')) {
      await initCurrentCompany()
      if (companies.value?.length > 0) {
        gotoTenant(companies.value[0].code, '/dashboard')
        return
      }
    }
    return
  }

  // App route — requires a tenant subdomain. Apex / reserved hosts have no
  // tenant to load, so bounce to sign-in.
  if (!subdomain) {
    window.location.assign('/signin')
    return
  }

  // The backend binds the session's active company to the host. fetchUserSession
  // handles 401 (→ /signin) and 403 / wrong-tenant (→ currentSession null) itself.
  await initSession(subdomain)
  await initCurrentCompany()

  const belongsToTenant = companies.value.some((c) => String(c.code).toLowerCase() === subdomain)
  if (!belongsToTenant) {
    // Authenticated but not a member of this tenant → send them to one they
    // belong to; if they belong to none, to sign-in.
    if (companies.value?.length > 0) {
      gotoTenant(companies.value[0].code, '/dashboard')
    } else {
      window.location.assign('/signin')
    }
    return
  }

  // Install syncEngine with the company-scoped IndexedDB.
  if (currentSession.value?.companyId) {
    await initSync(currentSession.value.companyId)
    // Keep the current user's permissions live: refresh them when role /
    // permission records change (see permissionSync).
    initPermissionSync()
  }
}

// One-shot silent recovery flag. If the boot path throws (IDB open
// blocked by a sibling tab, bootstrap GraphQL failure, etc.) we nuke
// the local IDB once and reload — quietly, no modal. The sessionStorage
// gate makes sure we only auto-recover ONCE per browser session; if the
// reload still fails the boot we stop instead of looping. sessionStorage
// clears when the tab closes, so a fresh session always gets one shot.
const RECOVERY_FLAG = 'qms.boot.autoRecoveryAttempted'

onMounted(async () => {
  try {
    await bootApp()

    // The permission guard lets navigation through while the session is still
    // loading (currentSession undefined). Now that boot has resolved it, re-run
    // the guard against the landing route so a hard reload / deep link to a
    // route the user lacks permission for is redirected to /no-access.
    const decision = evaluateRoute(router.currentRoute.value)
    if (decision !== true) await router.replace(decision)
  } catch (err) {
    console.error('[App] Boot failed', err)
    if (sessionStorage.getItem(RECOVERY_FLAG) !== '1') {
      sessionStorage.setItem(RECOVERY_FLAG, '1')
      console.warn('[App] Auto-recovering: nuking local IDB and reloading')
      try {
        await deleteAllSyncDatabases()
      } catch (e) {
        console.error('[App] Auto-recovery deleteAllSyncDatabases failed', e)
      }
      window.location.reload()
      return
    }
    // Second-time failure in the same session — don't loop. Hide the
    // spinner and let the rest of the UI render (it'll be broken, but
    // visibly broken with a console error is better than an infinite
    // dark loader the user can't escape).
    console.error('[App] Boot failed twice — giving up auto-recovery for this session')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <BaseToastContainer />
  <ConfirmDialogHost />
  <HotkeyHelp />
  <BaseCommandPalette />

  <!-- Route navigation progress — feedback while async page chunks load -->
  <div
    v-if="navigating"
    class="tw:fixed tw:inset-x-0 tw:top-0 tw:z-[10000] tw:h-0.5 tw:overflow-hidden tw:bg-primary/15"
  >
    <div class="app-nav-progress tw:h-full tw:w-2/5 tw:bg-primary" />
  </div>

  <!-- Full-screen loader overlay. Boot failures auto-recover silently
       via the catch block in onMounted (nuke local IDB + reload, gated
       to one shot per session). No modal/panel here — kept the UX
       quiet on purpose. -->
  <div
    v-if="loading"
    class="tw:fixed tw:inset-0 tw:z-[9999] tw:flex tw:items-center tw:justify-center tw:bg-[#101822]"
  >
    <div class="tw:text-center">
      <BaseSpinner :size="72" color="white" class="tw:mx-auto" />
      <div class="tw:text-lg tw:font-semibold tw:text-white tw:mt-4">Loading...</div>
    </div>
  </div>

  <!-- Main content -->
  <div v-else-if="isPublicRoute || isOpenRoute" class="tw:flex tw:flex-col tw:grow">
    <router-view />
  </div>

  <div v-else class="tw:flex tw:flex-col tw:h-screen tw:w-full">
    <FormTemplateSchemaBuilder v-if="showFormBuilder" :id="route.params.id" />

    <main v-else class="tw:flex! tw:flex-1 tw:overflow-hidden">
      <MainSidebar />

      <!-- Main Content -->
      <div class="tw:flex tw:flex-1 tw:flex-col tw:overflow-hidden">
        <MainHeader v-if="pageInfo.showHeader" />
        <div class="tw:flex-1 tw:overflow-auto">
          <RouterView />
        </div>
      </div>
    </main>

    <!-- AI sidecar — global slide-out chat (see backend/ai/README.md, AI_PLAN.md §6).
         Gated on canUseAi so tenants without the add-on don't even mount it. -->
    <ChatPanel v-if="canUseAi" />

    <!-- Prompts a reload when an admin changes this user's permissions while
         they're signed in (the syncEngine only re-bootstraps IDB on reload). -->
    <PermissionChangeDialog />
  </div>
</template>

<style scoped>
@keyframes app-nav-progress-slide {
  0% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(360%);
  }
}

.app-nav-progress {
  animation: app-nav-progress-slide 1s ease-in-out infinite;
}
</style>
