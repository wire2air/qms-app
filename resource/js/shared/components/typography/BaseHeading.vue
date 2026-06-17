<script setup>
/**
 * BaseHeading — semantic headings. `level` (1–6) controls BOTH the rendered
 * <h1>–<h6> tag (document outline) and the default visual size. Pass `as` to
 * override only the visual size — e.g. an <h2> that looks like a page title —
 * keeping structure and style decoupled (a key accessibility win).
 */
import {
  TEXT_VARIANT,
  HEADING_LEVEL,
  TEXT_COLOR,
  FONT_WEIGHT,
  TEXT_ALIGN,
  LINE_CLAMP,
} from './typography.js'

const props = defineProps({
  level: {
    type: [Number, String],
    default: 2,
    validator: (v) => Number(v) >= 1 && Number(v) <= 6,
  },
  // Visual size override (a TEXT_VARIANT key). Does NOT change the tag.
  as: { type: String, default: null, validator: (v) => v == null || v in TEXT_VARIANT },
  color: { type: String, default: null, validator: (v) => v == null || v in TEXT_COLOR },
  weight: { type: String, default: null, validator: (v) => v == null || v in FONT_WEIGHT },
  align: { type: String, default: 'left', validator: (v) => v in TEXT_ALIGN },
  truncate: { type: Boolean, default: false },
  lines: { type: [Number, String], default: null },
})

const variant = computed(() => TEXT_VARIANT[props.as] || TEXT_VARIANT[HEADING_LEVEL[Number(props.level)]])
const tag = computed(() => `h${Number(props.level)}`)

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
  <component :is="tag" :class="classes">
    <slot />
  </component>
</template>
