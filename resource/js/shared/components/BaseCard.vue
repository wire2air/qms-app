<script setup>
/**
 * BaseCard — the standard surface primitive (rounded-xl border + theme-aware
 * bg-card + padding). Replaces the ad-hoc `<div class="tw:rounded-xl tw:border
 * tw:border-divider tw:bg-sidebar tw:p-4">` blocks scattered across the app
 * (which also hardcode bg-white/bg-sidebar and break dark mode).
 *
 *   <BaseCard>…</BaseCard>
 *   <BaseCard padding="lg" as="section">…</BaseCard>
 *
 * For a titled section use PageSection (variant="card"); for a clickable card
 * use BaseClickableRow so it stays keyboard-operable.
 */
const props = defineProps({
  // none | sm | md (default) | lg
  padding: {
    type: String,
    default: 'md',
    validator: (v) => ['none', 'sm', 'md', 'lg'].includes(v),
  },
  as: { type: String, default: 'div' },
})

// Static map so Tailwind emits the classes.
const PADDING = {
  none: '',
  sm: 'tw:p-3',
  md: 'tw:p-4 tw:lg:p-5',
  lg: 'tw:p-6',
}

const paddingClass = computed(() => PADDING[props.padding] ?? PADDING.md)
</script>

<template>
  <component
    :is="as"
    class="tw:rounded-xl tw:border tw:border-divider tw:bg-card"
    :class="paddingClass"
  >
    <slot />
  </component>
</template>
