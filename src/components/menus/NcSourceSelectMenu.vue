<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const sources = useLiveQuery((db) => db.NcSource.where().orderBy('displayOrder').exec(), {
  models: ['NcSource'],
  initial: [],
})
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="sources"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— All sources —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <NcSourceBadgeById
          v-for="o in options"
          :key="o.value"
          :sourceId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
