<script setup>
defineOptions({ name: 'QcRetainSamplePage' })
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }
const route = useRoute()
</script>

<template>
  <RetainSampleDetail :id="route.params.id" />
</template>
