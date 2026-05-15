<script setup>
defineProps({
  status: { type: Object, required: true },
})
</script>

<template>
  <BaseBadge v-bind="$attrs" class="tw:bg-gray-100 tw:text-gray-700">
    {{ status.name || status.id || '—' }}
  </BaseBadge>
</template>
