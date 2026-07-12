<script setup>
defineOptions({ name: 'PlatformAdminsPage' })
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }
</script>

<template>
  <PlatformAdmins />
</template>
