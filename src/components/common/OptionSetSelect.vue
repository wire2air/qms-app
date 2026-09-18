<script setup>
defineOptions({ inheritAttrs: false })

const props = defineProps({
  options: {
    type: Array,
    default: () => [],
  },
  optionSetId: {
    type: String,
    default: null,
  },
  // Embedded OptionSet snapshot — { id, name, options }. Preferred
  // over the FK lookup so supplier users can render the form without
  // option_sets RLS grants. See ConfigOptions for the embed source.
  optionSet: {
    type: Object,
    default: null,
  },
  multiple: {
    type: Boolean,
    default: false,
  },
  required: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  readonly: {
    type: Boolean,
    default: false,
  },
  placeholder: {
    type: String,
    default: 'Select...',
  },
  label: {
    type: String,
    default: '',
  },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const fkOptionSet = useLiveQueryWithDeps(
  [() => props.optionSetId, () => !!props.optionSet],
  async (db, [optionSetId, hasEmbed]) => {
    if (hasEmbed) return null
    if (!optionSetId) return null
    return db.OptionSet.findByPk(optionSetId)
  },

  { models: ['OptionSet'], initial: null },
)

const computedItems = computed(() => {
  const rawOptions = props.optionSet?.options ?? fkOptionSet.value?.options ?? props.options ?? []
  return rawOptions.map((opt) => {
    if (typeof opt === 'string') return { id: opt, name: opt }
    // Support both {label, value} (Quasar format) and {id, name} format
    return {
      id: opt.value ?? opt.id ?? opt,
      name: opt.label ?? opt.name ?? String(opt),
    }
  })
})

const isDisabled = computed(() => props.disabled || props.readonly)
</script>

<template>
  <div :class="isDisabled ? 'tw:pointer-events-none tw:opacity-60' : ''">
    <div class="tw:text-sm">{{ label }}</div>
    <BaseSelect
      v-model="modelValue"
      :options="computedItems"
      optionLabel="name"
      optionValue="id"
      :multiple="multiple"
      :required="required"
      :placeholder="placeholder"
    >
      <template v-if="multiple" #selected="{ options: selectedOpts, remove }">
        <div class="tw:flex tw:flex-wrap tw:gap-1">
          <span
            v-for="o in selectedOpts"
            :key="o.value"
            class="tw:text-xs tw:font-medium tw:bg-primary/10 tw:text-primary tw:px-2 tw:py-0.5 tw:rounded-full tw:flex tw:items-center tw:gap-1"
          >
            {{ o.label }}
            <button
              v-if="!required || selectedOpts.length > 1"
              class="tw:text-primary/70 tw:hover:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0 tw:text-xs tw:leading-none"
              @click.stop="remove(o)"
            >
              &times;
            </button>
          </span>
        </div>
      </template>
    </BaseSelect>
  </div>
</template>
