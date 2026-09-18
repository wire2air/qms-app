<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const categories = useLiveQuery(
  (db) => db.RootCauseCategory.where().orderBy('displayOrder').exec(),

  { models: ['RootCauseCategory'], initial: [] },
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
        <RootCauseCategoryBadgeById
          v-for="o in options"
          :key="o.value"
          :categoryId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
