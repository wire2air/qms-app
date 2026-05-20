<script setup>
const props = defineProps({
  trainingId: { type: String, default: null },
})

const training = useLiveQueryWithDeps([() => props.trainingId], async (db, [trainingId]) => {
  if (!trainingId) return null
  return db.Training.findByPk(trainingId)
})
</script>

<template>
  <TrainingBadge v-if="training" :training="training" v-bind="$attrs" />
</template>
