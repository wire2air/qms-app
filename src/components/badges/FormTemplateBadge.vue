<script setup>
defineProps({
  formTemplate: { type: Object, required: true },
})
</script>

<template>
  <BaseBadge v-bind="$attrs">{{ formTemplate.title || formTemplate.code || '—' }}</BaseBadge>
</template>
