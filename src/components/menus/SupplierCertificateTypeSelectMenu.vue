<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  // Filter bars want "— All certificate types —"; a form field wants "— None —".
  // Same prop the documented SiteSelectMenu carries (CLAUDE.md, badge triad).
  nullLabel: { type: String, default: '— All certificate types —' },
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
    :nullLabel="nullLabel"
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
