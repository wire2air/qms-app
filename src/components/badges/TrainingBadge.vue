<script setup>
defineProps({
  training: { type: Object, required: true },
})
</script>

<template>
  <BaseBadge v-bind="$attrs">
    {{ training.title || training.id || '—' }}
  </BaseBadge>
</template>
