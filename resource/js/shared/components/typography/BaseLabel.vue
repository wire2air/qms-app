<script setup>
/**
 * BaseLabel — the single source of truth for form-label styling. Renders a
 * real <label> (pass `for` to associate it with a control) and centralizes the
 * required asterisk, optional hint, help icon, description subtitle, and the
 * disabled / error states — all from the shared typography token map.
 *
 * Use it directly for bespoke layouts; inside a form field, prefer BaseField
 * (Phase 3), which composes BaseLabel + BaseHelperText + BaseErrorText and owns
 * the generated id / aria wiring.
 */
import { IconHelpCircle } from '@tabler/icons-vue'
import { LABEL_SIZE, FONT_WEIGHT, TEXT_COLOR, TEXT_ALIGN } from './typography.js'

const props = defineProps({
  // Native label-for association (htmlFor).
  for: { type: String, default: undefined },
  size: { type: String, default: 'sm', validator: (v) => v in LABEL_SIZE },
  weight: { type: String, default: 'medium', validator: (v) => v in FONT_WEIGHT },
  // Semantic color (overridden by the disabled / error states below).
  color: { type: String, default: 'default', validator: (v) => v in TEXT_COLOR },
  required: { type: Boolean, default: false },
  optional: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  error: { type: Boolean, default: false },
  // Help text shown via an info icon (BaseTooltip on hover/focus). A #help slot
  // can supply richer content.
  help: { type: String, default: '' },
  // Subtitle rendered below the label text.
  description: { type: String, default: '' },
  align: { type: String, default: 'left', validator: (v) => v in TEXT_ALIGN },
  truncate: { type: Boolean, default: false },
})

const colorClass = computed(() => {
  if (props.disabled) return TEXT_COLOR.disabled
  if (props.error) return TEXT_COLOR.error
  return TEXT_COLOR[props.color]
})
</script>

<template>
  <label
    :for="props.for"
    :class="[
      'tw:block',
      LABEL_SIZE[size],
      FONT_WEIGHT[weight],
      colorClass,
      TEXT_ALIGN[align],
      disabled && 'tw:cursor-not-allowed',
    ]"
  >
    <span
      class="tw:inline-flex tw:items-center tw:gap-1 tw:align-middle"
      :class="truncate && 'tw:max-w-full tw:min-w-0'"
    >
      <span :class="truncate && 'tw:truncate'"><slot /></span>
      <!-- Asterisk is decorative; the accessible required state comes from the
           control's own `required` / `aria-required`. -->
      <span v-if="required" class="tw:text-bad" aria-hidden="true">*</span>
      <span v-else-if="optional" class="tw:text-caption tw:font-normal tw:text-secondary">
        (optional)
      </span>
      <!-- Help icon → BaseTooltip (hover + keyboard focus). The trigger is a
           real <button> so keyboard users can reach it; @click.stop.prevent
           keeps clicking it from activating the label's associated control. -->
      <BaseTooltip v-if="help || $slots.help" :content="help" class="tw:align-middle">
        <button
          type="button"
          class="tw:inline-flex tw:cursor-help tw:rounded-full tw:text-secondary tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/40"
          :aria-label="help || 'More information'"
          @click.stop.prevent
        >
          <IconHelpCircle class="tw:size-3.5" />
        </button>
        <template v-if="$slots.help" #content><slot name="help" /></template>
      </BaseTooltip>
    </span>
    <BaseText v-if="description || $slots.description" variant="caption" class="tw:mt-0.5 tw:block">
      <slot name="description">{{ description }}</slot>
    </BaseText>
  </label>
</template>
