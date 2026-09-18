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

const statuses = useLiveQuery(
  (db) => db.DocumentVersionStatus.where().orderBy('displayOrder').exec(),

  { models: ['DocumentVersionStatus'], initial: [] },
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="statuses"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— All statuses —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <BaseBadge
          v-for="o in options"
          :key="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        >
          {{ o.label }}
        </BaseBadge>
      </div>
    </template>
  </BaseSelect>
</template>
