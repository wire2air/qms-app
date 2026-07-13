<script setup>
defineProps({
  curriculum: { type: Object, required: true },
})
</script>

<template>
  <BaseBadge v-bind="$attrs">
    {{ curriculum.name || curriculum.id || '—' }}
  </BaseBadge>
</template>
