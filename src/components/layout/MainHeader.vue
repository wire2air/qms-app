<script setup>
import { IconUsersGroup, IconMenu2, IconRefresh, IconSparkles } from '@tabler/icons-vue'
import {
  isImpersonating,
  originalUserName,
  returnToOriginalUser,
  currentSession,
  canUseAi,
} from '@/utils/currentSession'
import { deleteAllSyncDatabases } from '@/utils/initSyncEngine.js'
import { useChatPanel } from '@/composables/useChatPanel'
import { useSidebar } from '@/composables/useSidebar'

const { toggle: toggleSidebar } = useSidebar()
const chatPanel = useChatPanel()

const impersonatedName = computed(() => {
  if (!currentSession.value) return ''
  return `${currentSession.value.firstName || ''} ${currentSession.value.lastName || ''}`.trim()
})

const resetting = ref(false)
const showHardReset = computed(() => import.meta.env.DEV || true)

async function resetSync() {
  resetting.value = true
  try {
    await deleteAllSyncDatabases()
  } finally {
    resetting.value = false
    window.location.reload()
  }
}
</script>

<template>
  <!-- Impersonation Banner -->
  <div
    v-if="isImpersonating"
    class="tw:bg-amber-500 tw:text-white tw:text-center tw:py-2 tw:px-4 tw:text-sm tw:font-medium tw:flex tw:items-center tw:justify-center tw:gap-2"
  >
    <IconUsersGroup :size="18" />
    <span>
      You are impersonating <strong>{{ impersonatedName }}</strong
      >.
    </span>
    <button
      class="tw:text-primary tw:underline tw:font-bold tw:text-sm tw:bg-transparent tw:border-0 tw:cursor-pointer"
      @click="returnToOriginalUser"
    >
      Return to your account
    </button>
    <span class="tw:text-white/70">({{ originalUserName }})</span>
  </div>

  <header
    class="tw:sticky tw:top-0 tw:z-sticky tw:border-b tw:border-divider tw:bg-sidebar/80 tw:backdrop-blur-md tw:pe-2 tw:sm:pe-4 tw:ps-1 tw:sm:ps-2 tw:py-2 tw:sm:py-3"
  >
    <!-- On mobile the row wraps so the search drops to its own full-width line
         below the title + controls (a single GlobalSearch instance, reordered
         with flex `order`). On lg+ it's one nowrap row with the search centered. -->
    <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-x-2 tw:gap-y-2 tw:lg:flex-nowrap tw:lg:gap-4">
      <!-- Left zone: sidebar toggle + the page title (teleported by PageHeader) -->
      <div class="tw:flex tw:min-w-0 tw:shrink tw:items-center tw:gap-1 tw:sm:gap-2 tw:lg:order-1">
        <button
          aria-label="Toggle navigation"
          class="tw:flex tw:size-10 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:text-primary tw:hover:bg-main-hover tw:transition-colors"
          @click="toggleSidebar"
        >
          <IconMenu2 :size="20" />
        </button>

        <div id="main-header-title" class="tw:min-w-0" />
      </div>

      <!-- Search: own full-width row on mobile (order-last); centered & flex-1 on lg. -->
      <div
        id="main-header-search"
        class="tw:order-last tw:w-full tw:lg:order-2 tw:lg:w-auto tw:lg:flex tw:lg:flex-1 tw:lg:justify-center"
      >
        <div class="tw:w-full tw:lg:max-w-xl">
          <GlobalSearch />
        </div>
      </div>

      <!-- Right zone: page actions (teleported by PageHeader) + global controls -->
      <div class="tw:ms-auto tw:flex tw:shrink-0 tw:items-center tw:gap-1 tw:sm:gap-2 tw:lg:order-3 tw:lg:gap-4">
        <div id="main-header-actions" class="tw:flex tw:items-center tw:gap-1 tw:sm:gap-2" />
        <ThemeToggle :size="20" />
        <button
          v-if="canUseAi"
          class="tw:flex tw:size-10 tw:items-center tw:justify-center tw:rounded-full tw:text-primary tw:hover:bg-main-hover tw:transition-colors"
          title="AI Assistant (⌘J)"
          @click="chatPanel.toggle()"
        >
          <IconSparkles :size="20" />
        </button>
        <NotificationsBell />
        <button
          v-if="showHardReset"
          class="tw:hidden tw:size-10 tw:sm:flex tw:items-center tw:justify-center tw:rounded-full tw:text-secondary tw:hover:bg-main-hover tw:transition-colors"
          :disabled="resetting"
          @click="resetSync"
        >
          <IconRefresh :size="20" :class="resetting ? 'tw:animate-spin' : ''" />
        </button>
      </div>
    </div>
  </header>
</template>
