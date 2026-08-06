<script setup>
/**
 * /logging — mobile-first logging dashboard (floor-user home for
 * capturing logs). Will be wrapped in a WebView for the iOS/Android app.
 *
 * Entitlement: the platform admin can switch the Portal Access module off
 * per tenant. Full-app sessions get the friendly notice below; PORTAL_ONLY
 * phone sessions are refused server-side (login 402s and every data route
 * carries portalEntitlementGuard), so this page never loads for them.
 */
import { IconDeviceMobileOff } from '@tabler/icons-vue'
import { isModuleEntitled } from '@/utils/currentSession.js'

defineOptions({
  name: 'LoggingDashboardPage',
})
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <LoggingDashboard v-if="isModuleEntitled('portal')" />
  <div
    v-else
    class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-3 tw:p-10 tw:text-center"
  >
    <IconDeviceMobileOff :size="40" class="tw:text-secondary" />
    <p class="tw:text-lg tw:font-semibold tw:text-on-sidebar">Mobile portal is not enabled</p>
    <p class="tw:max-w-md tw:text-sm tw:text-secondary">
      The Portal Access module is not part of this workspace's plan. Contact your administrator
      if you believe this is a mistake.
    </p>
  </div>
</template>
