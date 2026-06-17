<script setup>
defineProps({
  productFamily: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <BaseBadge v-bind="$attrs" class="tw:bg-violet-100 tw:text-violet-700">
    {{ productFamily.name || productFamily.code || '—' }}
  </BaseBadge>
</template>
