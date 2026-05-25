<script setup>
defineOptions({
  name: 'InspectionsLogsQueuePage',
})
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <MyQueueHome />
</template>
