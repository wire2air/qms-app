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

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="items"
    nullLabel="— All statuses —"
    :required="required"
    :multiple="multiple"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <WorkflowInstanceStatusBadgeById
              v-for="statusId in getArray()"
              :key="statusId"
              :statusId="statusId"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(statusId)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
            Select Statuses
          </span>
        </template>
        <template v-else>
          <WorkflowInstanceStatusBadgeById
            v-if="modelValue"
            :statusId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Status</span>
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
