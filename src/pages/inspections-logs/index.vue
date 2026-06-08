<script setup>
defineOptions({
  name: 'InspectionsLogsPage',
})
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <InspectionsLogsHome />
</template>
