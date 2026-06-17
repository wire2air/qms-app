<script setup>
/**
 * BaseSectionHeader — a "title (+ optional icon / subtitle) on the left,
 * actions on the right" header for cards and page sections. Replaces the
 * ~100+ hand-rolled
 *   <div class="tw:flex tw:items-center tw:justify-between">
 *     <h3 class="tw:text-sm tw:font-bold">Version & approval</h3>
 *     <div class="tw:flex tw:gap-2"><button>…</button></div>
 *   </div>
 * blocks scattered across detail pages.
 *
 * The title renders a real heading (BaseHeading) for document-outline
 * semantics — pass `level` for the correct <h*> tag and `size` for the visual
 * size, independently.
 *
 * Icons are NOT auto-imported — pass the imported component: `:icon="IconInfoCircle"`.
 *
 * @example
 *   <BaseSectionHeader title="Basic information" :icon="IconInfoCircle">
 *     <template #actions><BaseButton size="sm">Edit</BaseButton></template>
 *   </BaseSectionHeader>
 */
defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  // A @tabler/icons-vue component, imported by the consumer.
  icon: { type: [Object, Function], default: null },
  // Semantic heading level (rendered <h*> tag) for the document outline.
  level: { type: [Number, String], default: 3 },
  // Visual size — a TEXT_VARIANT key forwarded to BaseHeading `as`.
  size: { type: String, default: 'subheading' },
  iconSize: { type: Number, default: 18 },
})
</script>

<template>
  <div class="tw:flex tw:items-start tw:justify-between tw:gap-3">
    <div class="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
      <component
        :is="icon"
        v-if="icon"
        :size="iconSize"
        class="tw:shrink-0 tw:text-primary"
        aria-hidden="true"
      />
      <div class="tw:min-w-0">
        <BaseHeading :level="level" :as="size" truncate>
          <slot name="title">{{ title }}</slot>
        </BaseHeading>
        <BaseText
          v-if="subtitle || $slots.subtitle"
          variant="caption"
          class="tw:mt-0.5 tw:block"
        >
          <slot name="subtitle">{{ subtitle }}</slot>
        </BaseText>
      </div>
    </div>

    <div v-if="$slots.actions" class="tw:flex tw:shrink-0 tw:items-center tw:gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
