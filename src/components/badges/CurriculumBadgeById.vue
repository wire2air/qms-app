<script setup>
const props = defineProps({
  curriculumId: { type: String, default: null },
})

const curriculum = useLiveQueryWithDeps(
  [() => props.curriculumId],
  async (db, [curriculumId]) => {
    if (!curriculumId) return null
    return db.Curriculum.findByPk(curriculumId)
  },
  { models: ['Curriculum'] },
)
</script>

<template>
  <CurriculumBadge v-if="curriculum" :curriculum="curriculum" v-bind="$attrs" />
</template>
