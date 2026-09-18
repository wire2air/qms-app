<script setup>
defineProps({ title: { type: Object, required: true } })
</script>

<template>
  <BaseBadge v-bind="$attrs">{{ title.name || title.id }}</BaseBadge>
</template>
