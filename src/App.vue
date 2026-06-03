<script setup>
import { initSession, currentSession } from '@/utils/currentSession'
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
// Error captured from the boot sequence below. When set we render a
// recovery panel instead of leaving the dark loader on screen forever
// (the "black screen on refresh" symptom). Most common causes: IDB
// open blocked by a sibling tab, IDB open timed out, a bootstrap
// GraphQL call failing on the very first sync after a schema change.
const bootError = ref(null)
const recovering = ref(false)
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

onMounted(async () => {
  try {
    await bootApp()
  } catch (err) {
    console.error('[App] Boot failed', err)
    bootError.value = err?.message || 'Failed to load the app'
  } finally {
    loading.value = false
  }
})

// Last-resort recovery: nuke local IDB databases and reload. Same
// motion the MainHeader's "Reset Sync" button does, surfaced here
// when the user is stuck on the boot-error fallback and can't reach
// the header. deleteAllSyncDatabases already has the deadlock-safe
// onsuccess/onblocked/timeout dance — see src/utils/initSyncEngine.js.
async function resetAndReload() {
  recovering.value = true
  try {
    await deleteAllSyncDatabases()
  } catch (err) {
    console.error('[App] Reset failed', err)
  } finally {
    window.location.reload()
  }
}
</script>

<template>
  <BaseToastContainer />

  <!-- Boot error fallback. Replaces the dark loader when the onMounted
       boot sequence threw (IDB open blocked by a sibling tab, IDB open
       timed out, bootstrap GraphQL failure on first sync after a
       schema change, …). Without this branch a thrown boot left the
       loader on screen forever and the user saw a "black screen on
       refresh" they couldn't recover from. The Reset button calls
       deleteAllSyncDatabases() (deadlock-safe; see src/utils/initSync-
       Engine.js) and reloads. -->
  <div v-if="bootError" class="fixed-full flex flex-center bg-dark" style="z-index: 9999">
    <div
      class="tw:max-w-md tw:text-center tw:bg-white tw:rounded-lg tw:p-6 tw:shadow-lg tw:mx-4"
    >
      <div class="tw:text-lg tw:font-semibold tw:text-on-main tw:mb-2">
        Couldn't load the app
      </div>
      <div class="tw:text-sm tw:text-secondary tw:mb-4 tw:break-words">{{ bootError }}</div>
      <button
        type="button"
        class="tw:bg-primary tw:text-white tw:px-4 tw:py-2 tw:rounded tw:font-medium tw:cursor-pointer tw:hover:opacity-90 tw:disabled:opacity-50"
        :disabled="recovering"
        @click="resetAndReload"
      >
        {{ recovering ? 'Resetting…' : 'Reset sync & reload' }}
      </button>
    </div>
  </div>

  <!-- Full-screen loader overlay -->
  <div
    v-else-if="loading"
    class="fixed-full flex flex-center bg-dark"
    style="z-index: 9999"
  >
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
