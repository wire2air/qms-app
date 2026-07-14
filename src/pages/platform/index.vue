<script setup>
defineOptions({ name: 'PlatformConsolePage' })
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }
</script>

<template>
  <PlatformOverview />
</template>
