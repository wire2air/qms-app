<script setup>
defineOptions({
  name: 'InspectionsLogsTemplatesPage',
})
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <InspectionsLogsTemplatesHome />
</template>
