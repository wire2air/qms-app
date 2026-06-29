<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const certificateTypes = useLiveQuery(
  (db) => db.SupplierCertificateType.where().orderBy('displayOrder').exec(),

  { models: ['SupplierCertificateType'], initial: [] },
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="certificateTypes"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— All certificate types —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <SupplierCertificateTypeBadgeById
          v-for="o in options"
          :key="o.value"
          :certificateTypeId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
