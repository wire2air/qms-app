<script setup>
const props = defineProps({
  categoryId: { type: String, default: null },
})

const category = useLiveQueryWithDeps(
  [() => props.categoryId],
  async (db, [categoryId]) => {
    if (!categoryId) return null
    return db.EventCategory.findByPk(categoryId)
  },
  { models: ['EventCategory'], initial: null },
)
</script>

<template>
  <EventCategoryBadge v-if="category" :category="category" v-bind="$attrs" />
</template>
