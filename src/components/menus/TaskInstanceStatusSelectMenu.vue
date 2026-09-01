<script setup>
defineProps({
  required: {
    type: Boolean,
    default: false,
  },
  multiple: {
    type: Boolean,
    default: false,
  },
})

const modelValue = defineModel({
  type: [String, Array, null],
  default: null,
})

// Tasks F-12 — this menu hardcoded four ids while `task_instance_statuses`
// seeds ten, so CANCELLED / FORM_SUBMITTED / IN_PROGRESS / REASSIGNED /
// SENT_BACK / SUPERSEDED tasks were visible in the inbox and impossible to
// filter for. Reading the lookup table is what keeps it honest the next time
// a status is seeded — a copied list is what drifted in the first place.
const statuses = useLiveQuery(
  (db) => db.TaskInstanceStatus.where().orderBy('displayOrder').exec(),
  { models: ['TaskInstanceStatus'], initial: [] },
)

// APPROVED is the task vocabulary for "done" on every step type, not just
// approvals (see TaskInstanceStatusBadgeById). A filter has no step to
// disambiguate against, so it names both readings.
const items = computed(() =>
  statuses.value.map((s) => (s.id === 'APPROVED' ? { ...s, name: 'Approved / Completed' } : s)),
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="items"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— All statuses —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <TaskInstanceStatusBadgeById
          v-for="o in options"
          :key="o.value"
          :statusId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
