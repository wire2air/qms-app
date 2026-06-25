<script setup>
const props = defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  isFilter: { type: Boolean, default: false },
  nullLabel: { type: String, default: null },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const severities = useLiveQuery((db) => db.EventSeverity.where().orderBy('rank').exec(), {
  models: ['EventSeverity'],
  initial: [],
})

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}

const resolvedNullLabel = computed(
  () => props.nullLabel ?? (props.isFilter ? '— All severities —' : '— Select severity —'),
)
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="severities"
    :required="props.required"
    :multiple="props.multiple"
    :nullLabel="resolvedNullLabel"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <template v-if="props.multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <EventSeverityBadgeById
              v-for="id in getArray()"
              :key="id"
              :severityId="id"
              :clearable="!props.required || getArray().length > 1"
              @clear="() => scope.clear(id)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select Severity</span>
        </template>
        <template v-else>
          <EventSeverityBadgeById
            v-if="modelValue"
            :severityId="modelValue"
            :clearable="!props.required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select Severity</span>
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
