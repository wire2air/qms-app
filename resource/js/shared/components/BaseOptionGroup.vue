<script setup>
/**
 * BaseOptionGroup — radio / checkbox group (Tailwind replacement for the
 * Quasar-based WOptionGroup). Used by dynamic forms for `radio` and
 * `optionGroup` fields.
 *
 *   <BaseOptionGroup v-model="val" :options="opts" type="radio" />
 *   <BaseOptionGroup v-model="vals" :options="opts" type="checkbox" inline />
 *
 * Options may be strings or objects; optionLabel/optionValue select the
 * display/value keys (string key or resolver fn), matching WOptionGroup.
 * `checkbox`/`toggle` types use an array model; `radio` uses a single value.
 */
const props = defineProps({
  options: { type: Array, default: () => [] },
  optionLabel: { type: [String, Function], default: 'label' },
  optionValue: { type: [String, Function], default: 'value' },
  // 'radio' | 'checkbox' | 'toggle' (toggle treated as multi-select like checkbox)
  type: { type: String, default: 'radio' },
  inline: { type: Boolean, default: false },
  label: { type: String, default: '' },
  name: { type: String, default: undefined },
  disabled: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  instructions: { type: String, default: '' },
  hint: { type: String, default: '' },
  error: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' },
})

const model = defineModel({ type: [String, Number, Boolean, Array], default: undefined })

const isMultiple = computed(() => ['checkbox', 'toggle'].includes(props.type))
const isDisabled = computed(() => props.disabled || props.readonly)
const helpText = computed(() => props.instructions || props.hint)

function getOptionValue(option) {
  if (typeof option === 'string') return option
  if (typeof props.optionValue === 'function') return props.optionValue(option)
  return option[props.optionValue]
}

function getOptionLabel(option) {
  if (typeof option === 'string') return option
  if (typeof props.optionLabel === 'function') return props.optionLabel(option)
  return option[props.optionLabel]
}

function isChecked(value) {
  if (isMultiple.value) return Array.isArray(model.value) && model.value.includes(value)
  return model.value === value
}

function select(value) {
  if (isDisabled.value) return
  if (isMultiple.value) {
    const arr = Array.isArray(model.value) ? [...model.value] : []
    const i = arr.indexOf(value)
    if (i >= 0) arr.splice(i, 1)
    else arr.push(value)
    model.value = arr
  } else {
    model.value = value
  }
}

// Normalise the model to an array when switching to a multi-select type
// (mirrors WOptionGroup's behaviour so existing form data shape is preserved).
watch(
  () => props.type,
  (type) => {
    if (['checkbox', 'toggle'].includes(type) && !Array.isArray(model.value)) {
      model.value = model.value !== undefined && model.value !== null ? [model.value] : []
    }
  },
  { immediate: true },
)
</script>

<template>
  <div>
    <label v-if="label" class="tw:mb-2 tw:block tw:text-sm tw:font-medium tw:text-on-main">
      {{ label }}
    </label>

    <div :class="inline ? 'tw:flex tw:flex-wrap tw:gap-x-5 tw:gap-y-2' : 'tw:flex tw:flex-col tw:gap-2'">
      <label
        v-for="option in options"
        :key="getOptionValue(option)"
        class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-on-main"
        :class="isDisabled ? 'tw:cursor-not-allowed tw:opacity-60' : 'tw:cursor-pointer'"
      >
        <input
          :type="isMultiple ? 'checkbox' : 'radio'"
          :name="name"
          :value="getOptionValue(option)"
          :checked="isChecked(getOptionValue(option))"
          :disabled="isDisabled"
          class="tw:size-4 tw:shrink-0 tw:accent-primary"
          :class="isDisabled ? 'tw:cursor-not-allowed' : 'tw:cursor-pointer'"
          @change="select(getOptionValue(option))"
        />
        <span>{{ getOptionLabel(option) }}</span>
      </label>
    </div>

    <p v-if="helpText" class="tw:mt-1.5 tw:text-xs tw:text-secondary">{{ helpText }}</p>
    <p v-if="error && errorMessage" class="tw:mt-1.5 tw:text-xs tw:text-red-500">
      {{ errorMessage }}
    </p>
  </div>
</template>
