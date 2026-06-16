<script setup>
const props = defineProps({
  optionSetId: {
    type: String,
    default: null,
  },
})

const optionSet = useLiveQueryWithDeps(
  [() => props.optionSetId],
  async (db, [optionSetId]) => {
    if (!optionSetId) return null
    return db.OptionSet.findByPk(optionSetId)
  },

  { models: ['OptionSet'], initial: null },
)
</script>

<template>
  <OptionSetBadge v-if="optionSet" :optionSet="optionSet" v-bind="$attrs" />
</template>
