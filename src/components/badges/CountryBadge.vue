<script setup>
defineProps({ country: { type: Object, required: true } })
</script>
<template>
  <BaseBadge v-bind="$attrs">{{ country.name || country.code || country.id }}</BaseBadge>
</template>
