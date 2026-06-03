<script setup>
/**
 * /logging — mobile-first logging dashboard (floor-user home for
 * capturing logs). Will be wrapped in a WebView for the iOS/Android app.
 */
defineOptions({
  name: 'LoggingDashboardPage',
})
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <LoggingDashboard />
</template>
