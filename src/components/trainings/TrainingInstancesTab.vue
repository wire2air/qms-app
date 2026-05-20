<script setup>
const props = defineProps({
  trainingId: { type: String, required: true },
})

const instances = useLiveQueryWithDeps(
  [() => props.trainingId],
  async (db, [trainingId]) => {
    const all = await db.TrainingInstance.where('trainingId', trainingId).exec()
    return all.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },
  { initial: [] },
)
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <p v-if="!instances.length" class="tw:text-sm tw:text-secondary tw:italic">
      No instances launched yet.
    </p>
    <TrainingInstanceRow v-for="instance in instances" :key="instance.id" :instance="instance" />
  </div>
</template>
