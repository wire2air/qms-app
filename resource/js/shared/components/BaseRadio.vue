<script setup>
/**
 * BaseRadio — a single radio control (the leaf that BaseOptionGroup / BaseChecklist
 * re-implement inline). Mirrors BaseCheckbox: a visually-hidden native <input>
 * drives state and a styled span renders the dot, so keyboard focus shows a
 * `peer-focus-visible` ring (rule #8 / focus-visible).
 *
 * The v-model is the SELECTED value of the group; this radio is checked when the
 * model equals its own `value`. Give every radio in a group the same `name`.
 *
 *   <BaseRadio v-model="size" value="sm" name="size" label="Small" />
 *   <BaseRadio v-model="size" value="md" name="size" label="Medium" />
 */
const props = defineProps({
  // This radio's value; checked when it equals the model.
  value: { type: [String, Number, Boolean], required: true },
  disabled: { type: Boolean, default: false },
  label: { type: String, default: '' },
  // Shared radio-group name (groups native radios for arrow-key navigation).
  name: { type: String, default: undefined },
})

const model = defineModel({ type: [String, Number, Boolean, null], default: null })

const checked = computed(() => model.value === props.value)
</script>

<template>
  <label
    class="tw:relative tw:inline-flex tw:items-center tw:gap-2 tw:cursor-pointer tw:select-none"
    :class="disabled && 'tw:opacity-60 tw:cursor-not-allowed tw:pointer-events-none'"
  >
    <input
      type="radio"
      class="tw:peer tw:sr-only"
      :name="name"
      :value="value"
      :checked="checked"
      :disabled="disabled"
      @change="model = value"
    />
    <span
      :class="[
        'tw:inline-flex tw:items-center tw:justify-center tw:size-4 tw:shrink-0 tw:rounded-full tw:border tw:transition-colors tw:duration-150 tw:peer-focus-visible:ring-2 tw:peer-focus-visible:ring-primary/40 tw:peer-focus-visible:ring-offset-1',
        checked ? 'tw:border-primary' : 'tw:bg-sidebar tw:border-input-border',
      ]"
    >
      <span v-if="checked" class="tw:size-2 tw:rounded-full tw:bg-primary" />
    </span>
    <span class="tw:text-sm tw:text-on-main"><slot>{{ label }}</slot></span>
  </label>
</template>
