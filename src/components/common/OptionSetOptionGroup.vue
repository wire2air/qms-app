<script setup>
const props = defineProps({
  options: {
    type: Array,
    default: () => [],
  },
  optionSetId: {
    type: String,
    default: null,
  },
  // Embedded OptionSet snapshot — { id, name, options }. When present,
  // skips the FK lookup entirely so supplier users (who can't SELECT
  // option_sets via RLS) can still render. See ConfigOptions for the
  // embed-on-pick watcher.
  optionSet: {
    type: Object,
    default: null,
  },
})

// Forwards modelValue / type / inline / label / name / disabled to BaseOptionGroup.
const attrs = useAttrs()

const fkOptionSet = useLiveQueryWithDeps(
  [() => props.optionSetId, () => !!props.optionSet],
  async (db, [optionSetId, hasEmbed]) => {
    if (hasEmbed) return null // embedded wins; skip the lookup
    if (!optionSetId) return null
    return db.OptionSet.findByPk(optionSetId)
  },
  { initial: null },
)

const computedOptions = computed(() => {
  const source = props.optionSet?.options ?? fkOptionSet.value?.options
  if (source) {
    return source.map((opt) => {
      if (typeof opt === 'string') return { label: opt, value: opt }
      return opt
    })
  }
  return props.options || []
})
</script>

<template>
  <BaseOptionGroup v-bind="attrs" :options="computedOptions" />
</template>
