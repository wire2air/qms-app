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
  { id: 'ASSIGNED', name: 'Assigned' },
  { id: 'APPROVED', name: 'Approved' },
  { id: 'REJECTED', name: 'Rejected' },
  { id: 'CHANGES_REQUESTED', name: 'Changes Requested' },
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
        <!-- MULTIPLE MODE -->
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <TaskInstanceStatusBadgeById
              v-for="id in getArray()"
              :key="id"
              :statusId="id"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(id)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
            Select Statuses
          </span>
        </template>

        <!-- SINGLE MODE -->
        <template v-else>
          <TaskInstanceStatusBadgeById
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
