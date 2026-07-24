<script setup>
defineProps({
  id: {
    type: String,
    default: undefined,
  },
})
</script>

<template>
  <AppBuilderHome v-if="!id" />
  <RouterView v-else :id="id" />
</template>
