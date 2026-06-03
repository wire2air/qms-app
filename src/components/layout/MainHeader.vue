<script setup>
import { IconUsersGroup, IconMenu2, IconRefresh, IconSparkles } from '@tabler/icons-vue'
import { useCompanyLocalStorage } from '@/utils/useCompanyLocalStorage'
import {
  isImpersonating,
  originalUserName,
  returnToOriginalUser,
  currentSession,
  canUseAi,
} from '@/utils/currentSession'
import { deleteAllSyncDatabases } from '@/utils/initSyncEngine.js'
import { useChatPanel } from '@/composables/useChatPanel'

const drawer = useCompanyLocalStorage('sidebar-drawer', true)
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
    class="tw:sticky tw:top-0 tw:z-10 tw:border-b tw:border-divider tw:bg-sidebar/80 tw:backdrop-blur-md tw:pe-4 tw:ps-2 tw:py-3"
  >
    <div class="tw:flex tw:flex-nowrap tw:items-center tw:justify-between tw:gap-4 tw:flex-1">
      <div class="tw:flex tw:items-center tw:gap-2 tw:flex-1 tw:max-w-2xl">
        <button
          class="tw:p-2 tw:rounded-full tw:text-primary tw:hover:bg-main-hover tw:transition-colors"
          @click="drawer = !drawer"
        >
          <IconMenu2 :size="20" />
        </button>

        <div id="main-header-title" />

        <div id="main-header-search" class="tw:w-full"></div>
      </div>

      <div class="tw:flex tw:items-center tw:gap-4">
        <div id="main-header-actions" />
        <button
          v-if="canUseAi"
          class="tw:p-2 tw:rounded-full tw:text-primary tw:hover:bg-main-hover tw:transition-colors"
          title="AI Assistant (⌘K)"
          @click="chatPanel.toggle()"
        >
          <IconSparkles :size="20" />
        </button>
        <NotificationsBell />
        <button
          v-if="showHardReset"
          class="tw:p-2 tw:rounded-full tw:text-secondary tw:hover:bg-main-hover tw:transition-colors"
          :disabled="resetting"
          @click="resetSync"
        >
          <IconRefresh :size="20" :class="resetting ? 'tw:animate-spin' : ''" />
        </button>
      </div>
    </div>
  </header>
</template>
