<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const dispositionTypes = useLiveQuery(
  (db) => db.NcDispositionType.where().orderBy('displayOrder').exec(),

  { models: ['NcDispositionType'], initial: [] },
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="dispositionTypes"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— All dispositions —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <NcDispositionTypeBadgeById
          v-for="o in options"
          :key="o.value"
          :dispositionTypeId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
