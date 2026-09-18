<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const severities = useLiveQuery((db) => db.NcSeverity.where().orderBy('displayOrder').exec(), {
  models: ['NcSeverity'],
  initial: [],
})
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="severities"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— All severities —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <NcSeverityBadgeById
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
