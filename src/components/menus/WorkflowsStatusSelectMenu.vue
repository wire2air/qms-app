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

const statuses = useLiveQuery((db) => db.WorkflowStatus.where().orderBy('displayOrder').exec(), {
  models: ['WorkflowStatus'],
  initial: [],
})

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}

function getStatus(id) {
  return statuses.value.find((s) => s.id === id) ?? null
}
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="statuses"
    nullLabel="— All statuses —"
    :required="required"
    :multiple="multiple"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <!-- MULTIPLE MODE -->
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <BaseBadge
              v-for="id in getArray()"
              :key="id"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(id)"
            >
              {{ getStatus(id)?.name ?? id }}
            </BaseBadge>
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
            Select Statuses
          </span>
        </template>

        <!-- SINGLE MODE -->
        <template v-else>
          <BaseBadge
            v-if="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          >
            {{ getStatus(modelValue)?.name ?? modelValue }}
          </BaseBadge>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select Status</span>
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
