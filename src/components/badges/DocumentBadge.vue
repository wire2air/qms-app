<script setup>
defineProps({
  document: { type: Object, required: true },
})
</script>

<template>
  <BaseBadge v-bind="$attrs">{{ document.docNumber }} – {{ document.title }}</BaseBadge>
</template>
