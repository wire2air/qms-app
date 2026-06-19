<script setup>
const route = useRoute()
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }
</script>

<template>
  <QualityEventsPageId v-if="route.params.id" :id="route.params.id" />
  <QualityEventsHome v-else />
</template>
