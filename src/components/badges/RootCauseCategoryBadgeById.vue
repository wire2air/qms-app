<script setup>
const props = defineProps({
  categoryId: { type: String, default: null },
})

const category = useLiveQueryWithDeps(
  [() => props.categoryId],
  async (db, [id]) => {
    if (!id) return null
    return db.RootCauseCategory.findByPk(id)
  },

  { models: ['RootCauseCategory'], initial: null },
)
</script>

<template>
  <RootCauseCategoryBadge v-if="category" :category="category" v-bind="$attrs" />
</template>
