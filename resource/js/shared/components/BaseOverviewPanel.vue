<script setup>
/**
 * BaseOverviewPanel — the standard right-rail "Overview" card for detail pages.
 * Owns the card chrome + title so every detail page's overview looks identical
 * (same width, padding, header). Fill it with BaseDetailSection groups:
 *
 *   <BaseOverviewPanel>
 *     <BaseDetailSection title="General"> … </BaseDetailSection>
 *     <BaseDetailSection title="Ownership" divided> … </BaseDetailSection>
 *   </BaseOverviewPanel>
 *
 * Width is governed by the page's grid column — keep that column the same
 * across detail pages so panels match.
 */
const props = defineProps({
  title: { type: String, default: 'Overview' },
  // 'card' — white surface, rounded-lg (default, matches the record pages).
  // 'sidebar' — bg-sidebar, rounded-xl (matches the QC / inspection cards).
  tone: { type: String, default: 'card', validator: (v) => ['card', 'sidebar'].includes(v) },
})

const surface = computed(() =>
  props.tone === 'sidebar'
    ? 'tw:bg-sidebar tw:border tw:border-divider tw:rounded-xl tw:p-4'
    : 'tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4',
)
</script>

<template>
  <div :class="surface">
    <BaseText
      v-if="title || $slots.title"
      variant="overline"
      class="tw:block tw:pb-3 tw:border-b tw:border-divider tw:mb-4 tw:text-secondary"
    >
      <slot name="title">{{ title }}</slot>
    </BaseText>
    <slot />
  </div>
</template>
