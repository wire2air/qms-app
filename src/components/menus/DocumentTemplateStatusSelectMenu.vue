<script setup>
defineProps({
  required: {
    type: Boolean,
    default: false,
  },
})

const modelValue = defineModel({
  type: [String, null],
  default: null,
})

const statuses = useLiveQuery(async (db) => db.DocumentTemplateStatus.where().exec(), {
  models: ['DocumentTemplateStatus'],
  initial: [],
})
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="statuses"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :clearable="!required"
    nullLabel="— All statuses —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <DocumentTemplateStatusBadgeById
          v-for="o in options"
          :key="o.value"
          :statusId="o.value"
          :clearable="false"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
