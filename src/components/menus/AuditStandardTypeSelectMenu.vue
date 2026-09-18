<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const standardTypes = useLiveQuery(
  (db) => db.AuditStandardType.where().orderBy('displayOrder').exec(),

  { models: ['AuditStandardType'], initial: [] },
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="standardTypes"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— All standard types —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <AuditStandardTypeBadgeById
          v-for="o in options"
          :key="o.value"
          :standardTypeId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
