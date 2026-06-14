<script setup>
defineOptions({ name: 'QcInspectionSpecificationPage' })
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }
const route = useRoute()
</script>

<template>
  <SpecificationDetail :id="route.params.id" />
</template>
