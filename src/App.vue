<script setup>
import { initSession, currentSession } from '@/utils/currentSession'
import { initCurrentCompany, companies } from '@/utils/currentCompany'
import { isPublicRoute as isPublicRouteFn, isAuthRoute } from '@/constants/authRoutes'
import { initSync } from '@/utils/initSyncEngine.js'
import { currentSubdomain, gotoTenant } from '@/utils/tenant'

const pageInfo = ref({
  showHeader: true,
})
providePageInfo(pageInfo)

const route = useRoute()
const openRoutes = ['/form']
const loading = ref(true)
const showFormBuilder = computed(() => {
  return route.name === '/templates/[[id]]' && route.query.mode === 'schema'
})
const currentPath = window.location.pathname
const isOpenRoute = openRoutes.some(
  (route) => currentPath === route || currentPath.startsWith(`${route}/`),
)
// Public routes (signin, signup, …) render on any host and need no tenant.
const isPublicRoute = isPublicRouteFn(currentPath)

// Subdomain tenancy: the active tenant is the request host (acme.qability.com),
// not a path segment. null on apex / reserved hosts (localhost, admin.*, …).
const subdomain = currentSubdomain()

onMounted(async () => {
  if (isOpenRoute) {
    loading.value = false
    return
  }

  if (isPublicRoute) {
    // Public/auth pages render on any host. If already authenticated and on an
    // auth page, forward into the user's tenant app (its own subdomain).
    await initSession()
    if (currentSession.value && isAuthRoute(currentPath)) {
      await initCurrentCompany()
      if (companies.value?.length > 0) {
        gotoTenant(companies.value[0].code, '/dashboard')
        return
      }
    }
    loading.value = false
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

  const belongsToTenant = companies.value.some(
    (c) => String(c.code).toLowerCase() === subdomain,
  )
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
  }

  loading.value = false
})
</script>

<template>
  <BaseToastContainer />

  <!-- Full-screen loader overlay -->
  <div v-if="loading" class="fixed-full flex flex-center bg-dark" style="z-index: 9999">
    <div class="tw:text-center">
      <div
        class="tw:size-20 tw:animate-spin tw:rounded-full tw:border-4 tw:border-white tw:border-t-transparent"
      ></div>
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

    <!-- AI sidecar — global slide-out chat (see backend/ai/README.md, AI_PLAN.md §6) -->
    <ChatPanel />
  </div>
</template>
