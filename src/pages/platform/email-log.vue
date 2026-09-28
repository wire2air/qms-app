<script setup>
defineOptions({ name: 'PlatformEmailLogPage' })
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }
</script>

<template>
  <PlatformEmailLog />
</template>
