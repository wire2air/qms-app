<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const items = useLiveQuery((db) => db.CapaType.where().orderBy('displayOrder').exec(), {
  models: ['CapaType'],
  initial: [],
})
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="items"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— All types —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <CapaTypeBadgeById
          v-for="o in options"
          :key="o.value"
          :typeId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
