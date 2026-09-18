<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

// ACTIVE trainings — including document-driven ones, so they can be added to
// curricula (the doc-effective flow also auto-adds them to the selected curricula).
const trainings = useLiveQuery(
  async (db) =>
    db.Training.where()
      .exec()
      .then((all) => all.filter((t) => t.status === 'ACTIVE')),

  { models: ['Training'], initial: [] },
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="trainings"
    optionLabel="title"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— All trainings —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <TrainingBadgeById
          v-for="o in options"
          :key="o.value"
          :trainingId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
