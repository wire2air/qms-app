<script setup>
defineProps({
  id: {
    type: String,
    default: undefined,
  },
})
</script>

<template>
  <DocumentsHomeTabs v-if="!id" />
  <DocumentsCreate v-else-if="id === 'create'" />
  <DocumentsPageId v-else :id="id" :key="id" />
</template>
