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
const props = defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  // A @tabler/icons-vue component, imported by the consumer.
  icon: { type: [Object, Function], default: null },
  // Semantic heading level (rendered <h*> tag) for the document outline.
  level: { type: [Number, String], default: 3 },
  // Visual size — a TEXT_VARIANT key forwarded to BaseHeading `as`.
  size: { type: String, default: 'subheading' },
  iconSize: { type: Number, default: 18 },
  // 'plain' — bare icon (default); 'boxed' — icon in a tinted rounded square
  // (the card-header treatment used across detail pages).
  iconVariant: {
    type: String,
    default: 'plain',
    validator: (v) => ['plain', 'boxed'].includes(v),
  },
  // Tint for the boxed icon (and the plain icon's color). Static map so
  // Tailwind emits the classes.
  iconColor: {
    type: String,
    default: 'primary',
    validator: (v) => ['primary', 'blue', 'green', 'amber', 'red', 'purple', 'gray'].includes(v),
  },
})

// bg + text pairs per boxed-icon tint. `primary` uses the semantic token; the
// rest mirror the fixed palette the existing card headers already use. Static
// map so Tailwind emits the classes.
const ICON_COLOR = {
  primary: { box: 'tw:bg-primary/10', text: 'tw:text-primary' },
  blue: { box: 'tw:bg-blue-50', text: 'tw:text-blue-600' },
  green: { box: 'tw:bg-green-50', text: 'tw:text-green-600' },
  amber: { box: 'tw:bg-amber-50', text: 'tw:text-amber-600' },
  red: { box: 'tw:bg-red-50', text: 'tw:text-red-600' },
  purple: { box: 'tw:bg-purple-50', text: 'tw:text-purple-600' },
  gray: { box: 'tw:bg-gray-100', text: 'tw:text-gray-600' },
}

const tint = computed(() => ICON_COLOR[props.iconColor] || ICON_COLOR.primary)
</script>

<template>
  <div class="tw:flex tw:items-start tw:justify-between tw:gap-3">
    <div class="tw:flex tw:min-w-0 tw:items-center tw:gap-3">
      <div
        v-if="icon && iconVariant === 'boxed'"
        class="tw:flex tw:size-10 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-lg"
        :class="tint.box"
      >
        <component :is="icon" :size="iconSize" :class="tint.text" aria-hidden="true" />
      </div>
      <component
        :is="icon"
        v-else-if="icon"
        :size="iconSize"
        class="tw:shrink-0"
        :class="tint.text"
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
