<script setup>
defineOptions({ name: 'PlatformApprovalsPage' })
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }
</script>

<template>
  <PlatformApprovals />
</template>
