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
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="SEVERITIES"
    optionLabel="name"
    optionValue="id"
    nullLabel="— All severities —"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <DefectSeverityBadgeById
          v-for="o in options"
          :key="o.value"
          :severityId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
