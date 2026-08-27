<script setup>
defineProps({
  id: {
    type: String,
    default: undefined,
  },
})
</script>

<template>
  <CapasCreate v-if="id === 'create'" />
  <CapasPageId v-else-if="id" :id="id" :key="id" />
  <CapasHomeTabs v-else />
</template>
