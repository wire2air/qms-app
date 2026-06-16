<script setup>
const props = defineProps({
  moduleId: {
    type: String,
    default: null,
  },
})

const module = useLiveQueryWithDeps(
  [() => props.moduleId],
  async (db, [moduleId]) => {
    if (!moduleId) return null
    return db.Module.findByPk(moduleId)
  },

  { models: ['Module'], initial: null },
)
</script>

<template>
  <ModuleBadge v-if="module" :module="module" v-bind="$attrs" />
</template>
