<script setup>
defineProps({
  changeType: { type: Object, required: true },
})
</script>

<template>
  <BaseBadge v-bind="$attrs" class="tw:bg-purple-100 tw:text-purple-700">
    {{ changeType.name || changeType.id || '—' }}
  </BaseBadge>
</template>
