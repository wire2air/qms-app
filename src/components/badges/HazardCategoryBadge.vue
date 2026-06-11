<script setup>
/**
 * Object → display. Same data-driven colour pattern as
 * RootCauseCategoryBadge — colour off the row, tinted background
 * via 1A alpha suffix, neutral grey fallback when no colour.
 */
const props = defineProps({
  category: { type: Object, required: true },
})

const badgeStyle = computed(() => {
  if (!props.category?.color) return undefined
  return {
    backgroundColor: `${props.category.color}1A`,
    color: props.category.color,
  }
})
</script>

<template>
  <BaseBadge
    v-bind="$attrs"
    :style="badgeStyle"
    :class="!category?.color ? 'tw:bg-gray-100 tw:text-gray-600' : ''"
  >
    {{ category.name || category.code || '—' }}
  </BaseBadge>
</template>
