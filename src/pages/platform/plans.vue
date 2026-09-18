<script setup>
defineOptions({ name: 'PlatformPlansPage' })
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }
</script>

<template>
  <PlatformPlans />
</template>
