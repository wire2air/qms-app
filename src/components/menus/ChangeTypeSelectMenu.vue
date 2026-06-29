<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const changeTypes = useLiveQuery(
  (db) => db.ChangeType.where().orderBy('displayOrder').exec(),

  { models: ['ChangeType'], initial: [] },
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="changeTypes"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— All change types —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <ChangeTypeBadgeById
          v-for="o in options"
          :key="o.value"
          :changeTypeId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
