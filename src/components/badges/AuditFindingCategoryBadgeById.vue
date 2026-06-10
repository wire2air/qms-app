<script setup>
const props = defineProps({
  categoryId: { type: String, default: null },
})

const category = useLiveQueryWithDeps(
  [() => props.categoryId],
  async (db, [id]) => {
    if (!id) return null
    return db.AuditFindingCategory.findByPk(id)
  },
  { initial: null },
)
</script>

<template>
  <AuditFindingCategoryBadge v-if="category" :category="category" v-bind="$attrs" />
</template>
