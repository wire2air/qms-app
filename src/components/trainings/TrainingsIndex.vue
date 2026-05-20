<script setup>
defineProps({
  id: { type: String, default: undefined },
})
</script>

<template>
  <TrainingsCreate v-if="id === 'create'" />
  <TrainingPageId v-else-if="id" :id="id" :key="id" />
  <TrainingsHome v-else />
</template>
