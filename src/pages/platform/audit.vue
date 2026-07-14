<script setup>
defineOptions({ name: 'PlatformAuditPage' })
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }
</script>

<template>
  <PlatformAudit />
</template>
