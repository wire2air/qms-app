<script setup>
/**
 * ContentGrid — responsive auto-fill grid for card / stat / tile lists. Columns
 * flow from 1 (mobile) up to as many as fit, with NO breakpoint juggling: each
 * item is at least `min` wide but never wider than the container, so narrow
 * screens collapse to a single column with no horizontal scroll.
 *
 * Use this instead of hand-written `tw:grid tw:grid-cols-1 tw:md:grid-cols-2
 * tw:lg:grid-cols-3` ladders, which break at odd widths and differ page to page.
 *
 *   <ContentGrid min="18rem">
 *     <StatCard v-for="s in stats" :key="s.id" :stat="s" />
 *   </ContentGrid>
 */
const props = defineProps({
  // Minimum item width before the grid drops to fewer columns. Bigger min =
  // fewer, wider columns. e.g. '16rem' (~256px) for compact cards, '22rem' for
  // wide cards.
  min: { type: String, default: '16rem' },
  // Gap between items. comfortable (default, 16px) | compact (8px).
  gap: {
    type: String,
    default: 'comfortable',
    validator: (v) => ['comfortable', 'compact'].includes(v),
  },
})

const gapClass = computed(() => (props.gap === 'compact' ? 'tw:gap-2' : 'tw:gap-4'))
// min(100%, …) guarantees a single item never exceeds the container width — the
// guard that keeps narrow viewports from producing horizontal scroll.
const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${props.min}), 1fr))`,
}))
</script>

<template>
  <div class="tw:grid" :class="gapClass" :style="gridStyle">
    <slot />
  </div>
</template>
