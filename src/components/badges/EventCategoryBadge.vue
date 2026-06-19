<script setup>
/**
 * Object → display for a per-tenant event category. Renders the name with a
 * small colored dot from the lookup's `color` field (tenant-defined). Neutral
 * chrome so any tenant color reads cleanly.
 */
defineProps({
  category: { type: Object, required: true },
})
</script>

<template>
  <BaseBadge v-bind="$attrs" class="tw:bg-gray-100 tw:text-gray-700">
    <span
      v-if="category?.color"
      class="tw:inline-block tw:size-2 tw:rounded-full tw:mr-1.5 tw:align-middle"
      :style="{ backgroundColor: category.color }"
    />
    {{ category?.name || category?.code || '—' }}
  </BaseBadge>
</template>
