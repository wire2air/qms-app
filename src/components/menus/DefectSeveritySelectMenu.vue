<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})
const modelValue = defineModel({ type: [String, Array, null], default: null })

const SEVERITIES = [
  { id: 'CRITICAL', name: 'Critical' },
  { id: 'MAJOR', name: 'Major' },
  { id: 'MINOR', name: 'Minor' },
]

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="SEVERITIES"
    :required="required"
    :multiple="multiple"
    :hideNullOption="required"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <DefectSeverityBadgeById
              v-for="id in getArray()"
              :key="id"
              :severityId="id"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(id)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select severity</span>
        </template>
        <template v-else>
          <DefectSeverityBadgeById
            v-if="modelValue"
            :severityId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select severity</span>
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
