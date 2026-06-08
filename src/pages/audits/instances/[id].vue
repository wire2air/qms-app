<script setup>
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <AuditInstancesPageId :id="$route.params.id" />
</template>
