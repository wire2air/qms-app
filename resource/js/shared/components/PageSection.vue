<script setup>
/**
 * PageSection — a titled content group inside a BasePage. It pairs a
 * BaseSectionHeader (title / subtitle / icon + #actions) with a body at the
 * standard intra-section spacing, so every section looks identical across pages
 * instead of each one re-rolling a `flex justify-between` header + ad-hoc gaps.
 *
 * Optional `card` chrome wraps the section in the standard card surface
 * (rounded-xl border + bg-card + responsive padding) used across detail pages.
 *
 *   <PageSection title="Members" :icon="IconUsers">
 *     <template #actions><BaseButton size="sm">Add</BaseButton></template>
 *     <MembersTable />
 *   </PageSection>
 *
 * Icons are NOT auto-imported — pass the imported component: `:icon="IconUsers"`.
 */
const props = defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  // A @tabler/icons-vue component, imported by the consumer.
  icon: { type: [Object, Function], default: null },
  // Semantic heading level forwarded to BaseSectionHeader (sections sit under
  // the page <h1>, so default to <h2>).
  level: { type: [Number, String], default: 2 },
  // 'plain' (default) or 'card' (wrap in the standard card surface).
  variant: {
    type: String,
    default: 'plain',
    validator: (v) => ['plain', 'card'].includes(v),
  },
})

const slots = useSlots()
const hasHeader = computed(
  () => !!(props.title || props.icon || slots.title || slots.subtitle || slots.actions),
)
</script>

<template>
  <section
    class="tw:flex tw:flex-col tw:gap-4"
    :class="variant === 'card' && 'tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:p-4 tw:lg:p-5'"
  >
    <BaseSectionHeader
      v-if="hasHeader"
      :title="title"
      :subtitle="subtitle"
      :icon="icon"
      :level="level"
    >
      <template v-if="$slots.title" #title><slot name="title" /></template>
      <template v-if="$slots.subtitle" #subtitle><slot name="subtitle" /></template>
      <template v-if="$slots.actions" #actions><slot name="actions" /></template>
    </BaseSectionHeader>
    <slot />
  </section>
</template>
