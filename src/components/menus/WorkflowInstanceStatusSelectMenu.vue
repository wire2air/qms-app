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

const items = computed(() => [
  { id: 'IN_PROGRESS', name: 'In Progress' },
  { id: 'COMPLETED', name: 'Completed' },
  { id: 'REJECTED', name: 'Rejected' },
  { id: 'CHANGES_REQUESTED', name: 'Changes Requested' },
  { id: 'PENDING', name: 'Pending' },
])
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="items"
    optionLabel="name"
    optionValue="id"
    nullLabel="— All statuses —"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <WorkflowInstanceStatusBadgeById
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
