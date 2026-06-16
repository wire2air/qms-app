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

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <BaseSelectMenu v-model="modelValue" :items="trainings" :required="required" :multiple="multiple">
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <TrainingBadgeById
              v-for="trainingId in getArray()"
              :key="trainingId"
              :trainingId="trainingId"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(trainingId)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select Trainings</span>
        </template>
        <template v-else>
          <TrainingBadgeById
            v-if="modelValue"
            :trainingId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select Training</span>
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
