<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

// Only ACTIVE, non-doc-driven trainings show in the picker. Doc-driven trainings
// are launched by the document effective trigger, not via direct selection.
const trainings = useLiveQuery(
  async (db) =>
    db.Training.where()
      .exec()
      .then((all) => all.filter((t) => t.status === 'ACTIVE' && !t.sourceDocumentId)),

  { models: ['Training'], initial: [] },
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="trainings"
    optionLabel="name"
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
