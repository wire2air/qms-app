<script setup>
/**
 * Object → display. Data-driven colour (tenant-configurable on the
 * row). Tinted background via 1A alpha; neutral grey fallback when no
 * colour. Same pattern as RootCauseCategoryBadge.
 */
const props = defineProps({
  standardType: { type: Object, required: true },
})

const badgeStyle = computed(() => {
  if (!props.standardType?.color) return undefined
  return {
    backgroundColor: `${props.standardType.color}1A`,
    color: props.standardType.color,
  }
})
</script>

<template>
  <BaseBadge
    v-bind="$attrs"
    :style="badgeStyle"
    :class="!standardType?.color ? 'tw:bg-gray-100 tw:text-gray-600' : ''"
  >
    {{ standardType.name || standardType.code || '—' }}
  </BaseBadge>
</template>
