<script setup>
defineProps({
  id: { type: String, default: undefined },
})
</script>

<template>
  <TrainingInstancePageId v-if="id" :id="id" :key="id" />
  <TrainingInstancesHome v-else />
</template>
