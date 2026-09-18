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

const optionSets = useLiveQuery(async (db) => db.OptionSet.where().exec(), {
  models: ['OptionSet'],
  initial: [],
})
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="optionSets"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :clearable="!required"
    nullLabel="— All option sets —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <OptionSetBadgeById
          v-for="o in options"
          :key="o.value"
          :optionSetId="o.value"
          :clearable="false"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
