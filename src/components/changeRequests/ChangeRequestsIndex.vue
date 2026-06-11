<script setup>
defineProps({
  id: { type: String, default: undefined },
})
</script>

<template>
  <ChangeRequestsCreate v-if="id === 'create'" />
  <ChangeRequestsPageId v-else-if="id" :id="id" :key="id" />
  <ChangeRequestsHome v-else />
</template>
