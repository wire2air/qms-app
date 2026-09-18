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
  // "— None —" rather than "— All templates —": the only caller is the
  // document CREATE form, where the null option means "don't use a template"
  // (2026-08-16), not "any of them". A filter mounting this should pass the
  // all-of-them phrasing explicitly.
  nullLabel: {
    type: String,
    default: '— None —',
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
    :nullLabel="nullLabel"
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
