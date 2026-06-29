<script setup>
defineProps({
  required: {
    type: Boolean,
    default: false,
  },
  multiple: {
    type: Boolean,
    default: false,
  },
})

const modelValue = defineModel({
  type: [String, Array, null],
  default: null,
})

// Only PUBLISHED templates can be attached to new documents. DRAFT templates
// are not yet usable; ARCHIVED templates are read-only and not re-attachable.
const templates = useLiveQuery(
  async (db) => db.DocumentTemplate.where('statusId', 'PUBLISHED').exec(),

  { models: ['DocumentTemplate'], initial: [] },
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="templates"
    optionLabel="name"
    optionValue="id"
    nullLabel="— All templates —"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <DocumentTemplateBadgeById
          v-for="o in options"
          :key="o.value"
          :documentTemplateId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
