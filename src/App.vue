<script setup>
import { initSession, currentSession, canUseAi } from '@/utils/currentSession'
import { initCurrentCompany, companies } from '@/utils/currentCompany'
import { isPublicRoute as isPublicRouteFn, isAuthRoute } from '@/constants/authRoutes'
import { initSync, deleteAllSyncDatabases } from '@/utils/initSyncEngine.js'

const pageInfo = ref({
  showHeader: true,
})
providePageInfo(pageInfo)

const route = useRoute()
const openRoutes = ['/form']
const loading = ref(true)
const showFormBuilder = computed(() => {
  return route.name === '/[companyCode]/templates/[[id]]' && route.query.mode === 'schema'
})
const currentPath = window.location.pathname
const isOpenRoute = openRoutes.some(
  (route) => currentPath === route || currentPath.startsWith(`${route}/`),
)
// Check if this is a public route that doesn't depend on companyCode
const isPublicRoute = isPublicRouteFn(currentPath)

async function bootApp() {
  if (isOpenRoute) return

  if (isPublicRoute) {
    // For public routes, just init session without companyCode
    await initSession()
    if (currentSession.value && isAuthRoute(currentPath)) {
      await initCurrentCompany()
      if (companies.value?.length > 0) {
        const firstCompanyCode = companies.value[0].code
        window.location.href = `/${firstCompanyCode}/dashboard`
      }
    }
    return
  }

  // Extract companyCode from the pathname since route.params isn't populated yet
  const pathParts = currentPath.split('/').filter((part) => part !== '')
  const companyCode = pathParts[0] // First segment is the company code

  await initSession(companyCode)
  await initCurrentCompany()

  const isCompanyExists = companies.value.some((c) => c.code === companyCode)
  if (!isCompanyExists && companies.value?.length > 0) {
    const firstCompanyCode = companies.value[0].code
    window.location.href = `/${firstCompanyCode}/dashboard`
    return
  }

  // If URL companyCode doesn't match the active company in session, re-call session to update it
  const activeCompanyCode = currentSession.value?.activeCompanyCode
  if (activeCompanyCode && activeCompanyCode !== companyCode) {
    await initSession(companyCode)
  }

  // Install syncEngine with company-scoped DB
  if (currentSession.value?.companyId) {
    await initSync(currentSession.value.companyId)
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

  <!-- Full-screen loader overlay. Boot failures auto-recover silently
       via the catch block in onMounted (nuke local IDB + reload, gated
       to one shot per session). No modal/panel here — kept the UX
       quiet on purpose. -->
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

    <!-- AI sidecar — global slide-out chat (see backend/ai/README.md, AI_PLAN.md §6).
         Gated on canUseAi so tenants without the add-on don't even mount it. -->
    <ChatPanel v-if="canUseAi" />
  </div>
</template>
