<script setup>
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <AuditStandardsPageId :id="$route.params.id" />
</template>
