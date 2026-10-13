<script setup>
defineOptions({ name: 'PlatformCronsPage' })
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }
</script>

<template>
  <PlatformCrons />
</template>
