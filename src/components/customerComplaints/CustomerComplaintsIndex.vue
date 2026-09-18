<script setup>
defineProps({
  id: {
    type: String,
    default: undefined,
  },
})
</script>

<template>
  <CustomerComplaintsCreate v-if="id === 'create'" />
  <CustomerComplaintsPageId v-else-if="id" :id="id" :key="id" />
  <CustomerComplaintsHome v-else />
</template>
