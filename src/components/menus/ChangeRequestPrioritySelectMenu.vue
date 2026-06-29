<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const priorities = useLiveQuery(
  (db) => db.ChangeRequestPriority.where().orderBy('displayOrder').exec(),

  { models: ['ChangeRequestPriority'], initial: [] },
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="priorities"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— All priorities —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <ChangeRequestPriorityBadgeById
          v-for="o in options"
          :key="o.value"
          :priorityId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
