<script setup>
/**
 * Object → display. Colour comes off the row itself
 * (category.color, configured per tenant), not a SCHEME_MAP — the
 * lookup is fully tenant-editable so we can't ship a hard-coded
 * code → class map. Falls back to neutral grey when no color is
 * set on the row.
 *
 * Hex string is rendered as a tinted background (1A ≈ 10% alpha)
 * with the same hex as the foreground colour for legible contrast.
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
