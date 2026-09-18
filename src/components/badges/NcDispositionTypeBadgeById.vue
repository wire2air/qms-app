<script setup>
const props = defineProps({
  dispositionTypeId: {
    type: String,
    default: null,
  },
})

const dispositionType = useLiveQueryWithDeps(
  [() => props.dispositionTypeId],
  async (db, [dispositionTypeId]) => {
    if (!dispositionTypeId) return null
    return db.NcDispositionType.findByPk(dispositionTypeId)
  },

  { models: ['NcDispositionType'], initial: null },
)
</script>

<template>
  <NcDispositionTypeBadge
    v-if="dispositionType"
    :dispositionType="dispositionType"
    v-bind="$attrs"
  />
</template>
