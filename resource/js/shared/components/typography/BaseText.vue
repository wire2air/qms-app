<script setup>
/**
 * BaseText — the workhorse body/inline text primitive. All typography flows
 * through the shared token map; pass `variant` for the semantic style and
 * override individual dimensions (`color`, `weight`, `align`) as needed.
 */
import { TEXT_VARIANT, TEXT_COLOR, FONT_WEIGHT, TEXT_ALIGN, LINE_CLAMP } from './typography.js'

const props = defineProps({
  // Semantic style variant (body | caption | subheading | …). Drives size,
  // weight, default color and the default rendered tag.
  variant: { type: String, default: 'body', validator: (v) => v in TEXT_VARIANT },
  // Override the rendered tag without changing the visual variant.
  as: { type: String, default: null },
  // Semantic color override (see TEXT_COLOR).
  color: { type: String, default: null, validator: (v) => v == null || v in TEXT_COLOR },
  // Font-weight override (see FONT_WEIGHT).
  weight: { type: String, default: null, validator: (v) => v == null || v in FONT_WEIGHT },
  align: { type: String, default: 'left', validator: (v) => v in TEXT_ALIGN },
  truncate: { type: Boolean, default: false },
  // Clamp to N lines (1–4).
  lines: { type: [Number, String], default: null },
})

const variant = computed(() => TEXT_VARIANT[props.variant] || TEXT_VARIANT.body)

const classes = computed(() => [
  variant.value.size,
  props.weight ? FONT_WEIGHT[props.weight] : variant.value.weight,
  props.color ? TEXT_COLOR[props.color] : TEXT_COLOR[variant.value.color],
  variant.value.leading,
  TEXT_ALIGN[props.align],
  props.truncate && 'tw:truncate',
  props.lines ? LINE_CLAMP[props.lines] : '',
])
</script>

<template>
  <component :is="as || variant.tag" :class="classes">
    <slot />
  </component>
</template>
