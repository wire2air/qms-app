<script setup>
defineOptions({ name: 'PlatformQueuePage' })
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }
</script>

<template>
  <PlatformQueueJobs />
</template>
