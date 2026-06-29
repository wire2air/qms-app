<script setup>
const props = defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  isFilter: { type: Boolean, default: false },
  nullLabel: { type: String, default: null },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const categories = useLiveQuery((db) => db.EventCategory.where().orderBy('displayOrder').exec(), {
  models: ['EventCategory'],
  initial: [],
})

const resolvedNullLabel = computed(
  () => props.nullLabel ?? (props.isFilter ? '— All categories —' : '— Select category —'),
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="categories"
    optionLabel="name"
    optionValue="id"
    :required="props.required"
    :multiple="props.multiple"
    :clearable="!props.required"
    :nullLabel="resolvedNullLabel"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <EventCategoryBadgeById
          v-for="o in options"
          :key="o.value"
          :categoryId="o.value"
          :clearable="props.multiple && (!props.required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
