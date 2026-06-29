<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const categories = useLiveQuery(
  (db) => db.NcRootCauseCategory.where().orderBy('displayOrder').exec(),

  { models: ['NcRootCauseCategory'], initial: [] },
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="categories"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— All categories —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <BaseBadge
          v-for="o in options"
          :key="o.value"
          class="tw:bg-gray-100 tw:text-gray-700"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
          >{{ o.label }}</BaseBadge
        >
      </div>
    </template>
  </BaseSelect>
</template>
