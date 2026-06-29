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

const resolvedNullLabel = computed(
  () => props.nullLabel ?? (props.isFilter ? '— All severities —' : '— Select severity —'),
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="severities"
    optionLabel="name"
    optionValue="id"
    :required="props.required"
    :multiple="props.multiple"
    :clearable="!props.required"
    :nullLabel="resolvedNullLabel"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <EventSeverityBadgeById
          v-for="o in options"
          :key="o.value"
          :severityId="o.value"
          :clearable="props.multiple && (!props.required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
