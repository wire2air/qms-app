<script setup>
/**
 * BaseDetailSection — a titled group of read-only detail fields inside an
 * overview / side-rail panel. Streamlines the long, uninterrupted metadata
 * lists on detail pages into logical sections (General, Ownership, …), all on
 * the consistent stacked "label above value" layout (via BaseDetailField).
 *
 * Compose with BaseDetailField:
 *   <BaseOverviewPanel>
 *     <BaseDetailSection title="General">
 *       <BaseDetailField label="Number" :value="nc.ncNumber" />
 *       <BaseDetailField label="Status"><NcStatusBadgeById ... /></BaseDetailField>
 *     </BaseDetailSection>
 *     <BaseDetailSection title="Ownership" divided> … </BaseDetailSection>
 *   </BaseOverviewPanel>
 *
 * `divided` draws a top separator so stacked sections read as distinct groups.
 */
defineProps({
  title: { type: String, default: '' },
  divided: { type: Boolean, default: false },
})
</script>

<template>
  <div :class="divided ? 'tw:border-t tw:border-divider tw:pt-4 tw:mt-4' : ''">
    <BaseText
      v-if="title || $slots.title"
      variant="overline"
      class="tw:block tw:mb-3 tw:text-secondary"
    >
      <slot name="title">{{ title }}</slot>
    </BaseText>
    <div class="tw:flex tw:flex-col tw:gap-3">
      <slot />
    </div>
  </div>
</template>
