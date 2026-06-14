<script setup>
defineOptions({ name: 'QcInspectionLotPage' })
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }
const route = useRoute()
</script>

<template>
  <InspectionLotDetail :id="route.params.id" />
</template>
