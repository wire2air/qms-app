<script setup>
defineProps({ uom: { type: Object, required: true } })
</script>

<template>
  <BaseBadge v-bind="$attrs">{{ uom.name || uom.code || uom.id }}</BaseBadge>
</template>
