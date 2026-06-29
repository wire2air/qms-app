<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

// Only ACTIVE templates are attachable — drafts/archived can't back a
// public form.
const templates = useLiveQuery(
  async (db) => {
    const rows = await db.FormTemplate.where('statusId', 'ACTIVE').exec()
    return rows
      .map((t) => ({ id: t.id, name: t.title || t.code }))
      .sort((a, b) => a.name.localeCompare(b.name))
  },

  { models: ['FormTemplate'], initial: [] },
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="templates"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— All forms —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <FormTemplateBadgeById
          v-for="o in options"
          :key="o.value"
          :formTemplateId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
