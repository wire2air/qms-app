<script setup>
/**
 * BaseFieldRow — a responsive multi-column grid for laying out form fields (or
 * read-only detail pairs) side by side. Replaces the ~30 hand-rolled
 *   <div class="tw:grid tw:grid-cols-3 tw:gap-3">…</div>
 * blocks (e.g. ChangeRequestsPageId's Change-Type/Classification/Priority row)
 * with one wrapper that always collapses to a single column on mobile — no
 * per-page breakpoint juggling and no horizontal overflow on narrow screens.
 *
 *   <BaseFieldRow :columns="2">
 *     <BaseField label="First name"><BaseTextInput v-model="firstName" /></BaseField>
 *     <BaseField label="Last name"><BaseTextInput v-model="lastName" /></BaseField>
 *   </BaseFieldRow>
 *
 * For card/tile grids that flow to as many columns as fit, use ContentGrid; this
 * is for a fixed small number of form columns.
 */
const props = defineProps({
  // Target columns on wide screens (1–4). Always starts at 1 column on mobile.
  columns: {
    type: [Number, String],
    default: 2,
    validator: (v) => [1, 2, 3, 4].includes(Number(v)),
  },
  // Gap between fields. comfortable (default, 16px) | compact (12px).
  gap: {
    type: String,
    default: 'comfortable',
    validator: (v) => ['comfortable', 'compact'].includes(v),
  },
})

// Static maps so Tailwind emits the classes (no dynamic `grid-cols-${n}`).
const COLUMNS = {
  1: 'tw:grid-cols-1',
  2: 'tw:grid-cols-1 tw:sm:grid-cols-2',
  3: 'tw:grid-cols-1 tw:sm:grid-cols-2 tw:lg:grid-cols-3',
  4: 'tw:grid-cols-1 tw:sm:grid-cols-2 tw:lg:grid-cols-4',
}

const columnsClass = computed(() => COLUMNS[Number(props.columns)] || COLUMNS[2])
const gapClass = computed(() => (props.gap === 'compact' ? 'tw:gap-3' : 'tw:gap-4'))
</script>

<template>
  <div class="tw:grid" :class="[columnsClass, gapClass]">
    <slot />
  </div>
</template>
