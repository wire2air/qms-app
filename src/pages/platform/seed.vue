<script setup>
defineOptions({ name: 'PlatformSeedPage' })
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }
</script>

<template>
  <PlatformSeed />
</template>
