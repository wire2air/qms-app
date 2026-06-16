<script setup>
const props = defineProps({
  relatedStandardId: {
    type: String,
    default: null,
  },
})

const relatedStandard = useLiveQueryWithDeps(
  [() => props.relatedStandardId],
  async (db, [relatedStandardId]) => {
    if (!relatedStandardId) return null
    return db.RelatedStandard.findByPk(relatedStandardId)
  },

  { models: ['RelatedStandard'], initial: null },
)
</script>

<template>
  <RelatedStandardBadge v-if="relatedStandard" :relatedStandard="relatedStandard" v-bind="$attrs" />
</template>
