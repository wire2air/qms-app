<script setup>
defineProps({ region: { type: Object, required: true } })
</script>
<template>
  <BaseBadge v-bind="$attrs">{{ region.name || region.code || region.id }}</BaseBadge>
</template>
